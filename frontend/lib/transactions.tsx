'use client';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useAccount, useConfig, useSwitchChain, useWriteContract } from 'wagmi';
import { simulateContract, waitForTransactionReceipt } from 'wagmi/actions';
import type { Abi, Address, Hash } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import { explorer, type DestinationId } from './chains';
import { transactionError } from './tx-errors';
import styles from '@/components/App.module.css';
export { transactionError };
type Write = {
  chainId: DestinationId;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  success?: string;
};
const SUCCESS: Record<string, string> = {
  approve: 'Approval confirmed',
  createOrder: 'Order created',
  swap: 'Swap confirmed',
  cancelOrder: 'Order cancelled',
  claimFeeRefund: 'Refund claimed',
  reclaimExpired: 'Refund claimed',
  claim: 'Tokens claimed',
};
type Notice = { id: number; state: string; chainId?: DestinationId; hash?: Hash; message?: string };
const Context = createContext<{
  run: (write: Write) => Promise<Hash | undefined>;
  busy: boolean;
  notify: (message: string) => void;
}>({ run: async () => undefined, busy: false, notify: () => {} });
export function TransactionProvider({ children }: { children: ReactNode }) {
  const config = useConfig(),
    account = useAccount(),
    query = useQueryClient();
  const { switchChainAsync } = useSwitchChain(),
    { writeContractAsync } = useWriteContract();
  const [notices, setNotices] = useState<Notice[]>([]),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    sequence = useRef(0);
  const update = (notice: Notice) =>
    setNotices((old) => [...old.filter((n) => n.id !== notice.id), notice].slice(-5));
  const notify = (message: string) =>
    update({ id: ++sequence.current, state: 'confirmed', message });
  const run = async ({ success, ...write }: Write) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const id = ++sequence.current;
    const notice = { id, chainId: write.chainId };
    try {
      if (!account.address) throw new Error('Connect your wallet first.');
      update({ ...notice, state: 'pending signature' });
      if (account.chainId !== write.chainId) await switchChainAsync({ chainId: write.chainId });
      const { request } = await simulateContract(config, { ...write, account: account.address });
      const hash = await writeContractAsync(request);
      update({ ...notice, state: 'submitted', hash });
      const receipt = await waitForTransactionReceipt(config, { chainId: write.chainId, hash });
      if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain.');
      update({
        ...notice,
        state: 'confirmed',
        hash,
        message: success ?? SUCCESS[write.functionName],
      });
      await query.invalidateQueries();
      window.dispatchEvent(new Event('reflex:refresh'));
      return hash;
    } catch (error) {
      update({ ...notice, state: 'failed', message: transactionError(error) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Context.Provider value={{ run, busy, notify }}>
      {children}
      <div className={styles.toasts} aria-live="polite" aria-relevant="additions text">
        {notices.map((n) => (
          <article className="frame" key={n.id}>
            <strong>
              {n.state === 'submitted' && <span className={styles.spinner} aria-hidden="true" />}
              {n.state}
            </strong>
            {n.message && <p>{n.message}</p>}
            {n.hash && n.chainId && (
              <a href={explorer(n.chainId, `tx/${n.hash}`)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            )}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotices((old) => old.filter((item) => item.id !== n.id))}
            >
              ×
            </button>
          </article>
        ))}
      </div>
    </Context.Provider>
  );
}
export const useTransaction = () => useContext(Context);
