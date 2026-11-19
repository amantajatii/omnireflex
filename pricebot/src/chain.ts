import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { poolAbi, swapAbi, tokenAbi } from './abi.ts';
import { decodeSlot0, decide, priceToSqrtPriceX96, slot0Slot, sqrtPriceX96ToPrice } from './math.ts';
import { createTransactions } from './transactions.ts';
import { log, runLoop } from './runtime.ts';
import type { Config } from './config.ts';
import type { DestRecord } from './records.ts';

export const newHealth = () => ({ poolPrice: null as number | null, lastSwapAt: null as number | null,
  lastTx: null as string | null, lastError: null as string | null, swaps: 0 });

export function runChain(rec: DestRecord, cfg: Config, account: PrivateKeyAccount | undefined,
  health: ReturnType<typeof newHealth>, feed: () => Promise<number | null>,
  paused: () => boolean, signal: AbortSignal) {
  const chain = defineChain({ id: rec.chainId, name: String(rec.chainId),
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc[rec.chainId]] } } });
  const transport = http(cfg.rpc[rec.chainId], { retryCount: 0, timeout: 8000 });
  const client = createPublicClient({ chain, transport });
  const wallet = account ? createWalletClient({ chain, transport, account }) : undefined;
  const tx = wallet ? createTransactions(client, wallet, rec, cfg, signal, paused) : undefined;
  const orientation = rec.rdETH.toLowerCase() === rec.poolKey.currency0.toLowerCase();
  const slot = slot0Slot(rec.poolId);
  async function readPool() {
    const word = await client.readContract({ address: rec.poolManager, abi: poolAbi,
      functionName: 'extsload', args: [slot] });
    const { sqrtPriceX96 } = decodeSlot0(word);
    health.poolPrice = sqrtPriceX96ToPrice(sqrtPriceX96, orientation);
    return sqrtPriceX96;
  }
  async function step() {
    await tx?.settle();
    await tx?.approve();
    const reference = await feed();
    if (signal.aborted) return;
    const current = await readPool();
    if (reference === null) { log(`chain ${rec.chainId} pool=${health.poolPrice} reference unavailable`); return; }
    const poolPrice = health.poolPrice!;
    const decision = decide({ ...cfg, poolPrice, refPrice: reference, lastSwapAt: health.lastSwapAt,
      now: Date.now(), paused: paused() });
    if (cfg.dryRun) {
      log(`chain ${rec.chainId} dry-run pool=${poolPrice} ref=${reference} intendedStep=${decision.target} action=${decision.reason ?? 'swap'}`);
      health.lastError = null;
      return;
    }
    if (decision.reason) {
      if (decision.reason === 'bounds') log(`chain ${rec.chainId} warning: target ${decision.target} outside price bounds`);
      return;
    }
    if (signal.aborted || paused()) return;
    const gasPrice = await client.getGasPrice();
    if (gasPrice > cfg.maxGas) { log(`chain ${rec.chainId} skipped: gas above cap`); return; }
    const limit = priceToSqrtPriceX96(decision.target, orientation);
    if (limit === current) return;
    const zeroForOne = limit < current;
    const token = zeroForOne ? rec.poolKey.currency0 : rec.poolKey.currency1;
    const max = token.toLowerCase() === rec.rdETH.toLowerCase() ? cfg.maxInputEth : cfg.maxInputUsd;
    const balance = await client.readContract({ address: token, abi: tokenAbi,
      functionName: 'balanceOf', args: [account!.address] });
    if (balance === 0n) { log(`chain ${rec.chainId} warning: empty input token balance`); return; }
    const { request } = await client.simulateContract({ account, address: rec.swapRouter, abi: swapAbi,
      functionName: 'swap', args: [rec.poolKey, { zeroForOne, amountSpecified: -(balance < max ? balance : max),
        sqrtPriceLimitX96: limit }, { takeClaims: false, settleUsingBurn: false }, '0x'], value: 0n, gasPrice });
    await tx!.send(request, (receipt) => {
      health.lastSwapAt = Date.now(); health.lastTx = receipt.transactionHash; health.swaps++;
      // Read/log after confirmation even when a previous receipt wait timed out.
      confirmed = { poolPrice, reference, hash: receipt.transactionHash, gas: receipt.gasUsed };
    });
  }
  let confirmed: { poolPrice: number; reference: number; hash: string; gas: bigint } | null = null;
  return runLoop(async () => {
    if (confirmed) {
      await readPool();
      log(`chain ${rec.chainId} ${confirmed.poolPrice} → ${health.poolPrice} ref=${confirmed.reference} tx=${confirmed.hash} gasUsed=${confirmed.gas}`);
      confirmed = null;
    }
    await step();
    if (confirmed) {
      await readPool();
      log(`chain ${rec.chainId} ${confirmed.poolPrice} → ${health.poolPrice} ref=${confirmed.reference} tx=${confirmed.hash} gasUsed=${confirmed.gas}`);
      confirmed = null;
    }
    health.lastError = null;
  }, cfg.pollMs, signal, (message) => { health.lastError = message; log(`chain ${rec.chainId}: ${message}`); });
}
