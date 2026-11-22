import { parseEventLogs, type Address, type PublicClient } from 'viem';
import { executorAbi, poolAbi } from './abi.ts';
import { decodeSlot0, slot0Slot, sqrtPriceX96ToPrice } from './math.ts';
import { errorMessage, log } from './runtime.ts';
import type { Config } from './config.ts';
import type { DestRecord } from './records.ts';
import type { createTransactions } from './transactions.ts';

export const ORDER_SCAN_LIMIT = 500n;
const ORDER_READ_BATCH = 10;
const HEARTBEAT_RETRY_MS = 10 * 60_000;

/** True when the price follower will not swap this step (same threshold as decide()). */
export function isPoolAligned(poolPrice: number, reference: number | null, deviationBps: number): boolean {
  if (reference === null || !(reference > 0) || !(poolPrice > 0)) return false;
  return Math.abs(poolPrice / reference - 1) * 10_000 < deviationBps;
}
export const newHeartbeatHealth = () => ({ lastOrderId: null as string | null,
  lastResult: null as string | null, lastError: null as string | null, lastCycleAt: null as number | null });

export function heartbeatAction(status: number, expiry: bigint, now: bigint, fee = 0n, refundableAt = 0n) {
  if (status === 1) return expiry !== 0n && expiry < now ? 'reclaim' : 'skip';
  if (status === 3 && fee > 0n && refundableAt !== 0n && refundableAt <= now) return 'claim';
  return 'create';
}

export function heartbeatOrder(rec: DestRecord, cfg: Config, sqrtPrice: bigint, tick: number, now: bigint) {
  const zeroForOne = rec.rdETH.toLowerCase() === rec.poolKey.currency0.toLowerCase();
  const inverted = !zeroForOne;
  const t = inverted ? -tick : tick;
  // Use the larger downside distance so both arms cover at least the requested percentage.
  const distance = Math.ceil(-Math.log1p(-cfg.heartbeatBandBps / 10000) / Math.log(1.0001));
  if (!Number.isInteger(tick) || Math.abs(t) + distance > 887272 || sqrtPrice <= 0n) {
    throw new Error('invalid heartbeat price or tick band');
  }
  const small = sqrtPrice <= (1n << 128n) - 1n;
  const ratio = small ? sqrtPrice * sqrtPrice : sqrtPrice * sqrtPrice / (1n << 64n);
  const scale = 1n << (small ? 192n : 128n);
  const quoted = zeroForOne ? cfg.heartbeatAmount * ratio / scale : cfg.heartbeatAmount * scale / ratio;
  const minAmountOut = quoted * BigInt(10000 - cfg.heartbeatSlippageBps) / 10000n;
  if (minAmountOut <= 0n || minAmountOut >= 2n ** 128n) throw new Error('heartbeat output outside uint128');
  return { poolKey: rec.poolKey, zeroForOne, amountIn: cfg.heartbeatAmount, minAmountOut,
    expiry: now + BigInt(Math.floor(cfg.heartbeatTtlMs / 1000)),
    trigger: { chainId: BigInt(rec.chainId), poolId: rec.poolId, inverted,
      lowerTick: t - distance, upperTick: t + distance, trailTicks: 0 } };
}

export type ScannedOrder = { id: bigint; status: number; expiry: bigint; fee: bigint; refundableAt: bigint };

export async function scanOrders(client: PublicClient, executor: Address, owner: Address,
  sinceId = 0n, tracked: Iterable<bigint> = []) {
  const [head, next] = await Promise.all([
    client.getBlock(),
    client.readContract({ address: executor, abi: executorAbi, functionName: 'nextOrderId' }) as Promise<bigint>,
  ]);
  const latestId = next > 1n ? next - 1n : 0n;
  if (latestId === 0n) {
    return { orders: [] as ScannedOrder[], now: head.timestamp, scannedUpTo: 0n, nextTracked: new Set<bigint>() };
  }
  const startId = sinceId > 0n
    ? sinceId + 1n
    : (latestId >= ORDER_SCAN_LIMIT ? latestId - ORDER_SCAN_LIMIT + 1n : 1n);
  const idSet = new Set<bigint>();
  for (const id of tracked) if (id >= 1n && id <= latestId) idSet.add(id);
  for (let id = startId; id <= latestId; id++) idSet.add(id);
  const ids = [...idSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const ownerLower = owner.toLowerCase();
  const orders: ScannedOrder[] = [];
  const nextTracked = new Set<bigint>();
  for (let i = 0; i < ids.length; i += ORDER_READ_BATCH) {
    const batch = ids.slice(i, i + ORDER_READ_BATCH);
    const loaded = await Promise.all(batch.map(id =>
      client.readContract({ address: executor, abi: executorAbi, functionName: 'getOrder', args: [id] }) as Promise<{
        owner: Address; status: number; params: { expiry: bigint };
      }>));
    for (let j = 0; j < batch.length; j++) {
      const id = batch[j], order = loaded[j];
      if (order.owner.toLowerCase() !== ownerLower) continue;
      const fee = order.status === 3
        ? await client.readContract({ address: executor, abi: executorAbi, functionName: 'orderFee', args: [id] }) as bigint
        : 0n;
      const refundableAt = fee > 0n
        ? await client.readContract({ address: executor, abi: executorAbi, functionName: 'refundableAt', args: [id] }) as bigint
        : 0n;
      orders.push({ id, status: order.status, expiry: order.params.expiry, fee, refundableAt });
      if (order.status === 1 || (order.status === 3 && fee > 0n)) nextTracked.add(id);
    }
  }
  return { orders, now: head.timestamp, scannedUpTo: latestId, nextTracked };
}

export function createHeartbeat(client: PublicClient, tx: ReturnType<typeof createTransactions> | undefined,
  rec: DestRecord, cfg: Config, owner: Address | undefined, health: ReturnType<typeof newHeartbeatHealth>,
  paused: () => boolean, signal: AbortSignal) {
  let nextCycle = 0;
  let scannedUpTo = 0n;
  let tracked = new Set<bigint>();
  return async (reference: number | null) => {
    if (!cfg.heartbeatEnabled || !cfg.heartbeatChains.includes(rec.chainId) || signal.aborted) return;
    if (Date.now() < nextCycle) return;
    const result = (message: string) => {
      if (health.lastResult !== message) log(`chain ${rec.chainId} heartbeat ${message}`);
      health.lastResult = message;
    };
    health.lastCycleAt = Date.now();
    if (paused()) { result('paused'); return; }
    try {
      const gas = await client.getGasPrice();
      if (gas > cfg.maxGas) { result('gas above cap'); return; }
      if (cfg.dryRun) {
        nextCycle = Date.now() + cfg.heartbeatIntervalMs;
        health.lastError = null;
        result(`dry-run: discover, reclaim/refund, create ${cfg.heartbeatAmount} wei rdETH bracket if no active order`);
        return;
      }
      nextCycle = Date.now() + cfg.heartbeatIntervalMs;
      if (!tx || !owner) throw new Error('heartbeat wallet unavailable');
      async function send(functionName: 'reclaimExpired' | 'claimFeeRefund' | 'createOrder', args: any[],
        value = 0n, onReceipt?: Parameters<ReturnType<typeof createTransactions>['send']>[1]) {
        if (signal.aborted || paused()) throw new Error('heartbeat stopped');
        const gasPrice = await client.getGasPrice();
        if (gasPrice > cfg.maxGas) throw new Error('heartbeat gas above cap');
        const { request } = await client.simulateContract({ account: owner!, address: rec.executor,
          abi: executorAbi, functionName, args: args as any, value, gasPrice });
        await tx!.send(request, onReceipt);
      }
      const scan = await scanOrders(client, rec.executor, owner, scannedUpTo, tracked);
      scannedUpTo = scan.scannedUpTo;
      tracked = scan.nextTracked;
      let active = false;
      for (const order of scan.orders) {
        const action = heartbeatAction(order.status, order.expiry, scan.now, order.fee, order.refundableAt);
        if (action === 'skip') active = true;
        if (action === 'reclaim') { await send('reclaimExpired', [order.id]); result(`reclaimed ${order.id}`); }
        if (action === 'claim') {
          await send('claimFeeRefund', [order.id]);
          tracked.delete(order.id);
          result(`refunded ${order.id}`);
        }
      }
      if (active) { result('active order found; skipped creation'); health.lastError = null; return; }
      const word = await client.readContract({ address: rec.poolManager, abi: poolAbi,
        functionName: 'extsload', args: [slot0Slot(rec.poolId)] });
      const { sqrtPriceX96, tick } = decodeSlot0(word);
      // A bracket centred on a lagging pool would be crossed by our own catch-up swap; wait until aligned.
      const poolPrice = sqrtPriceX96ToPrice(sqrtPriceX96, rec.rdETH.toLowerCase() === rec.poolKey.currency0.toLowerCase());
      if (!isPoolAligned(poolPrice, reference, cfg.deviationBps)) {
        nextCycle = Date.now() + Math.min(cfg.heartbeatIntervalMs, cfg.minSwapIntervalMs + cfg.pollMs);
        result('pool not aligned with reference; waiting'); health.lastError = null; return;
      }
      await tx.ensureAllowance(rec.rdETH, rec.executor, cfg.heartbeatAmount);
      const latest = await client.getBlock();
      const params = heartbeatOrder(rec, cfg, sqrtPriceX96, tick, latest.timestamp);
      const fee = await client.readContract({ address: rec.executor, abi: executorAbi, functionName: 'executionFee' });
      await send('createOrder', [params], fee, receipt => {
        const events = parseEventLogs({ abi: executorAbi, eventName: 'OrderCreated', logs: receipt.logs });
        const event = events.find(e => e.address.toLowerCase() === rec.executor.toLowerCase()
          && e.args.owner.toLowerCase() === owner.toLowerCase());
        if (!event) throw new Error('heartbeat receipt missing OrderCreated');
        health.lastOrderId = event.args.orderId.toString(); health.lastError = null;
        result(`created ${health.lastOrderId}`);
      });
    } catch (error) {
      // Retry sooner than a full interval so a transient RPC/gas failure does not skip a heartbeat for hours.
      nextCycle = Date.now() + Math.min(cfg.heartbeatIntervalMs, HEARTBEAT_RETRY_MS);
      health.lastError = errorMessage(error);
      result(`error: ${health.lastError}`);
    }
  };
}
