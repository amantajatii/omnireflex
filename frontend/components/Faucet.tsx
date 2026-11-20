'use client';
import { useAccount, useReadContracts } from 'wagmi';
import { erc20Abi, zeroAddress } from 'viem';
import { chains, destinationIds, type DestinationId } from '@/lib/chains';
import { deployments } from '@/lib/deployments';
import { faucetAbi } from '@/lib/write-abi';
import { formatCooldown } from '@/lib/action-logic';
import { useTransaction } from '@/lib/transactions';
import { useFeed } from '@/lib/feed';
import { ConnectWallet } from './WalletCard';
import styles from './Faucet.module.css';
import { Corners } from './Shared';
import { PageHeader } from './PageHeader';
import { formatAmount } from '@/lib/format';
function FaucetCard({ chainId }: { chainId: DestinationId }) {
  const { address, chainId: walletChain } = useAccount();
  const { now } = useFeed();
  const { run, busy } = useTransaction();
  const deployment = deployments[chainId],
    faucet = deployment.faucet;
  const config = { chainId, address: faucet ?? zeroAddress, abi: faucetAbi } as const;
  const reads = useReadContracts({
    contracts: [
      { ...config, functionName: 'ethDrip' },
      { ...config, functionName: 'usdDrip' },
      { ...config, functionName: 'nextClaimAt', args: [address ?? zeroAddress] },
      {
        chainId,
        address: deployment.rdETH,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [faucet ?? zeroAddress],
      },
      {
        chainId,
        address: deployment.rdUSD,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [faucet ?? zeroAddress],
      },
    ],
    query: { enabled: Boolean(faucet), refetchInterval: 15000 },
  });
  const eth = reads.data?.[0]?.result,
    usd = reads.data?.[1]?.result,
    next = reads.data?.[2]?.result;
  const ethStock = reads.data?.[3]?.result,
    usdStock = reads.data?.[4]?.result;
  const failed = reads.isError || reads.data?.some((read) => read.status === 'failure');
  const ready =
    eth !== undefined &&
    usd !== undefined &&
    next !== undefined &&
    ethStock !== undefined &&
    usdStock !== undefined;
  const remaining =
    next === undefined || !now ? 0 : Math.max(0, Number(next) - Math.floor(now / 1000));
  const empty = ready && (ethStock < eth || usdStock < usd);
  const claim = async () => {
    if (!faucet || !address || !ready || remaining || empty) return;
    if (await run({ chainId, address: faucet, abi: faucetAbi, functionName: 'claim' }))
      await reads.refetch();
  };
  const status = !faucet
    ? 'Faucet not deployed yet'
    : failed
      ? 'Faucet reads unavailable. Retrying in 15 s.'
      : !ready
        ? 'Loading faucet…'
        : empty
          ? 'Faucet is empty. Try again after it is funded.'
          : address && remaining
            ? `Available in ${formatCooldown(remaining)}`
            : address
              ? 'Ready to claim'
              : 'Connect to check your cooldown';
  return (
    <article className={`panel frame ${styles.card}`}>
      <Corners />
      <header className={styles.cardHead}>
        <span className="eyebrow">{chains[chainId].name}</span>
        <span
          role="status"
          aria-live="polite"
          className={`mono ${styles.status}`}
          data-ready={Boolean(faucet && address && ready && !remaining && !empty)}
        >
          {status}
        </span>
      </header>
      <dl className={styles.drip} aria-label="Tokens per claim">
        <div>
          <dt>rdETH</dt>
          <dd>{eth === undefined ? (faucet ? '…' : '5') : formatAmount(eth)}</dd>
        </div>
        <div>
          <dt>rdUSD</dt>
          <dd>{usd === undefined ? (faucet ? '…' : '15,000') : formatAmount(usd)}</dd>
        </div>
      </dl>
      {faucet && (
        <div className={styles.action}>
          {address ? (
            <>
              <button
                className="button"
                disabled={busy || !ready || Boolean(remaining) || Boolean(empty) || !now}
                onClick={() => void claim()}
              >
                {busy ? 'Transaction in progress…' : 'Claim demo tokens'}
              </button>
              {walletChain !== chainId && (
                <p className={styles.note}>Your wallet will switch to {chains[chainId].name}.</p>
              )}
            </>
          ) : (
            <ConnectWallet />
          )}
        </div>
      )}
    </article>
  );
}
export function Faucet() {
  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumb="Trade / Faucet"
        title="Fuel the next loop."
        subtitle="Claim demo assets, then create an order or move the market. Claims need testnet ETH for gas."
      />
      <div className={styles.grid}>
        {destinationIds.map((id) => (
          <FaucetCard key={id} chainId={id} />
        ))}
      </div>
      <section className={`panel frame ${styles.card}`}>
        <Corners />
        <h2>Need testnet ETH?</h2>
        <p className={styles.note}>Claims and orders pay gas in ETH on the destination chain.</p>
        <ul className={styles.links}>
          <li>
            <a href="https://console.optimism.io/faucet" target="_blank" rel="noreferrer">
              Superchain faucet · Unichain Sepolia and Base Sepolia ↗
            </a>
          </li>
          <li>
            <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank" rel="noreferrer">
              Alchemy · Base Sepolia ↗
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
