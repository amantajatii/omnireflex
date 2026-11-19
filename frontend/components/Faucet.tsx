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
import styles from './Market.module.css';
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
  return (
    <article className={`panel frame ${styles.card}`}>
      <Corners />
      <span className="eyebrow">{chains[chainId].name}</span>
      <h2>Demo tokens.</h2>
      {!faucet ? (
        <>
          <p>5 rdETH + 15,000 rdUSD per claim</p>
          <p className="muted">Faucet not deployed yet</p>
        </>
      ) : (
        <>
          <p>
            {eth === undefined ? '…' : formatAmount(eth)} rdETH +{' '}
            {usd === undefined ? '…' : formatAmount(usd)} rdUSD per claim
          </p>
          <p role="status" aria-live="polite">
            {failed
              ? 'Faucet reads unavailable. Retrying in 15 s.'
              : !ready
                ? 'Loading faucet…'
                : empty
                  ? 'Faucet is empty. Please try again after it is funded.'
                  : address && remaining
                    ? `Available in ${formatCooldown(remaining)}`
                    : address
                      ? 'Ready to claim'
                      : 'Connect to check your cooldown.'}
          </p>
          {address ? (
            <>
              <button
                className={styles.submit}
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
        </>
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
        <p>Use a faucet below to fund your wallet on the destination chain.</p>
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
