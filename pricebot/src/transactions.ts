import { maxUint256, type PublicClient, type WalletClient, type Hash, type Address, type TransactionReceipt } from 'viem';
import { tokenAbi } from './abi.ts';
import type { Config } from './config.ts';
import type { DestRecord } from './records.ts';

type Pending = { hash: Hash; onReceipt: (r: TransactionReceipt) => void };

export function createTransactions(client: PublicClient, wallet: WalletClient, rec: DestRecord,
  cfg: Config, signal: AbortSignal, paused: () => boolean) {
  let pending: Pending | null = null;
  let broadcastUncertain = false;
  async function settle(): Promise<void> {
    if (!pending) return;
    const receipt = await client.waitForTransactionReceipt({ hash: pending.hash, timeout: 90000 });
    const done = pending;
    pending = null;
    if (receipt.status !== 'success') throw new Error(`transaction reverted on chain ${rec.chainId}`);
    done.onReceipt(receipt);
  }
  // After an ambiguous broadcast error, resume only once no transaction of ours is waiting in the mempool.
  async function reconcile(): Promise<void> {
    const address = wallet.account!.address;
    const [latest, next] = await Promise.all([
      client.getTransactionCount({ address, blockTag: 'latest' }),
      client.getTransactionCount({ address, blockTag: 'pending' }),
    ]);
    if (next !== latest) throw new Error('broadcast unresolved; waiting for mempool transaction');
    broadcastUncertain = false;
  }
  async function send(request: any, onReceipt: Pending['onReceipt'] = () => {}): Promise<void> {
    if (pending) throw new Error('previous transaction still pending');
    if (broadcastUncertain) await reconcile();
    if (signal.aborted || paused()) throw new Error('transaction stopped: paused or shutting down');
    // A failed RPC response may still mean the node accepted the transaction.
    broadcastUncertain = true;
    // Always sign with the local account: a bare address here would fall back to eth_sendTransaction.
    const hash = await wallet.writeContract({ ...request, account: wallet.account! });
    broadcastUncertain = false;
    pending = { hash, onReceipt };
    await settle();
  }
  async function approve(): Promise<void> {
    for (const [token, limit] of [[rec.rdETH, cfg.maxInputEth], [rec.rdUSD, cfg.maxInputUsd]] as const) {
      await ensureAllowance(token, rec.swapRouter, limit);
    }
  }
  async function ensureAllowance(token: Address, spender: Address, limit: bigint): Promise<void> {
    if (signal.aborted || paused()) return;
    const allowance = await client.readContract({ address: token, abi: tokenAbi, functionName: 'allowance',
      args: [wallet.account!.address, spender] });
    if (allowance >= limit) return;
    const gasPrice = await client.getGasPrice();
    if (gasPrice > cfg.maxGas) return;
    const { request, result } = await client.simulateContract({ account: wallet.account!, address: token,
      abi: tokenAbi, functionName: 'approve', args: [spender, maxUint256], gasPrice });
    if (!result) throw new Error('token approval returned false');
    await send(request);
  }
  return { settle, send, approve, ensureAllowance };
}
