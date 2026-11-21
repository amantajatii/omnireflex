import { parseEventLogs, type Address, type PublicClient } from 'viem';
import { executorAbi, poolAbi } from './abi.ts';
import { decodeSlot0, slot0Slot, sqrtPriceX96ToPrice } from './math.ts';
import { errorMessage, log } from './runtime.ts';
import type { Config } from './config.ts';
import type { DestRecord } from './records.ts';
import type { createTransactions } from './transactions.ts';

export const LOG_CHUNK = 1000n;
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

export async function scanOrders(client: PublicClient, executor: Address, owner: Address, lookbackSeconds: bigint) {
  const head = await client.getBlock();
  const cutoff = head.timestamp > lookbackSeconds ? head.timestamp - lookbackSeconds : 0n;
  let low = 0n, high = head.number;
  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });
    if (block.timestamp < cutoff) low = mid + 1n;
    else high = mid;
  }
  const ids = new Set<bigint>();
  for (let from = low; from <= head.number; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n;
    const logs = await client.getContractEvents({ address: executor, abi: executorAbi,
      eventName: 'OrderCreated', args: { owner }, fromBlock: from,
      toBlock: to < head.number ? to : head.number, strict: true });
    for (const event of logs) ids.add(event.args.orderId);
  }
  return { ids: [...ids], now: head.timestamp };
}

export function createHeartbeat(client: PublicClient, tx: ReturnType<typeof createTransactions> | undefined,
  rec: DestRecord, cfg: Config, owner: Address | undefined, health: ReturnType<typeof newHeartbeatHealth>,
  paused: () => boolean, signal: AbortSignal) {
  let nextCycle = 0;
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
      const read = (functionName: 'getOrder' | 'orderFee' | 'refundableAt', id: bigint) =>
        client.readContract({ address: rec.executor, abi: executorAbi, functionName, args: [id] });
      async function send(functionName: 'reclaimExpired' | 'claimFeeRefund' | 'createOrder', args: any[],
        value = 0n, onReceipt?: Parameters<ReturnType<typeof createTransactions>['send']>[1]) {
        if (signal.aborted || paused()) throw new Error('heartbeat stopped');
        const gasPrice = await client.getGasPrice();
        if (gasPrice > cfg.maxGas) throw new Error('heartbeat gas above cap');
        const { request } = await client.simulateContract({ account: owner!, address: rec.executor,
          abi: executorAbi, functionName, args: args as any, value, gasPrice });
        await tx!.send(request, onReceipt);
      }
      // Covers creation, next-cycle reclaim, following-cycle refund, plus a downtime margin.
      const lookback = BigInt(Math.ceil((2 * cfg.heartbeatIntervalMs + cfg.heartbeatTtlMs) / 1000) + 180 + 3600);
      const { ids, now } = await scanOrders(client, rec.executor, owner, lookback);
      let active = false;
      for (const id of ids) {
        const order = await read('getOrder', id) as { owner: Address; status: number; params: { expiry: bigint } };
        if (order.owner.toLowerCase() !== owner.toLowerCase()) throw new Error('heartbeat order owner mismatch');
        const fee = order.status === 3 ? await read('orderFee', id) as bigint : 0n;
        const refundableAt = fee > 0n ? await read('refundableAt', id) as bigint : 0n;
        const action = heartbeatAction(order.status, order.params.expiry, now, fee, refundableAt);
        if (action === 'skip') active = true;
        if (action === 'reclaim') { await send('reclaimExpired', [id]); result(`reclaimed ${id}`); }
        if (action === 'claim') { await send('claimFeeRefund', [id]); result(`refunded ${id}`); }
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
