'use client';
import { useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { erc20Abi, parseEventLogs, parseUnits, type Hash } from 'viem';
import { chains, clients, explorer, type DestinationId } from '@/lib/chains';
import { deployments } from '@/lib/deployments';
import { useFeed } from '@/lib/feed';
import { isSystemStale, swapPriceLimit } from '@/lib/action-logic';
import { poolSwapEvent, swapRouterAbi } from '@/lib/write-abi';
import { tickPrice } from '@/lib/model';
import { formatAmount, formatNumber, formatPrice } from '@/lib/format';
import { useTransaction } from '@/lib/transactions';
import { ConnectWallet } from './WalletCard';
import Select from './Select';
import styles from './Market.module.css';
import { Corners } from './Shared';
// Widest liquidity position (SetupPriceBot.s.sol, rdETH is currency1 on both pools):
// rdETH ≈ 500–10,000 rdUSD. The original ±4800-tick seed around 3,000 is narrower.
const WIDE_TICK_LOWER = -92160;
const WIDE_TICK_UPPER = -62100;
export function MarketSwap({
  chain,
  onChainChange,
}: {
  /** Controlled chain, so a surrounding chart follows the pool being swapped. */
  chain?: DestinationId;
  onChainChange?: (chainId: DestinationId) => void;
} = {}) {
  const { address, chainId: walletChain } = useAccount();
  const [selected, setSelected] = useState<DestinationId>();
  const chainId = chain ?? selected ?? (walletChain === 84532 ? 84532 : 1301);
  const [sellEth, setSellEth] = useState(true),
    [amount, setAmount] = useState('1');
  const [result, setResult] = useState<{ hash: Hash; chainId: DestinationId; price?: number }>();
  const { run, busy } = useTransaction();
  const { systems, errors, now } = useFeed();
  const deployment = deployments[chainId],
    token = sellEth ? deployment.rdETH : deployment.rdUSD;
  const symbol = sellEth ? 'rdETH' : 'rdUSD';
  const zeroForOne = token.toLowerCase() === deployment.poolKey.currency0.toLowerCase();
  const reads = useReadContracts({
    contracts: [
      { chainId, address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address!] },
      {
        chainId,
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address!, deployment.swapRouter],
      },
    ],
    query: { enabled: Boolean(address), refetchInterval: 15000 },
  });
  const balance = reads.data?.[0]?.result,
    allowance = reads.data?.[1]?.result;
  let value = 0n;
  let error = '';
  if (!/^\d+(\.\d{0,18})?$/.test(amount)) error = 'Enter a valid amount with at most 18 decimals.';
  else {
    try {
      value = parseUnits(amount, 18);
    } catch {
      error = 'Invalid amount.';
    }
  }
  if (!error && value <= 0n) error = 'Enter an amount above zero.';
  if (!error && value > parseUnits(sellEth ? '5' : '15000', 18))
    error = `Maximum ${sellEth ? '5 rdETH' : '15,000 rdUSD'} per swap.`;
  if (!error && balance !== undefined && value > balance) error = `Insufficient ${symbol} balance.`;
  const system = systems[chainId];
  const stale = isSystemStale(system, now, errors[chainId]);
  const edgePrices = [tickPrice(WIDE_TICK_UPPER), tickPrice(WIDE_TICK_LOWER)];
  const nearEdge = system && edgePrices.some((edge) => Math.abs(system.price - edge) / edge <= 0.1);
  const outOfRange = system && (system.tick <= WIDE_TICK_LOWER || system.tick >= WIDE_TICK_UPPER);
  const approved = allowance !== undefined && allowance >= value;
  const unavailable = reads.isError || reads.data?.some((read) => read.status === 'failure');
  const submit = async () => {
    if (error || stale || outOfRange || balance === undefined || allowance === undefined) return;
    if (!approved) {
      const hash = await run({
        chainId,
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [deployment.swapRouter, value],
      });
      if (hash) await reads.refetch();
      return;
    }
    const hash = await run({
      chainId,
      address: deployment.swapRouter,
      abi: swapRouterAbi,
      functionName: 'swap',
      args: [
        deployment.poolKey,
        { zeroForOne, amountSpecified: -value, sqrtPriceLimitX96: swapPriceLimit(zeroForOne) },
        { takeClaims: false, settleUsingBurn: false },
        '0x',
      ],
    });
    if (hash) {
      setResult({ hash, chainId });
      try {
        const receipt = await clients[chainId].getTransactionReceipt({ hash });
        const swap = parseEventLogs({
          abi: [poolSwapEvent],
          logs: receipt.logs.filter(
            (log) => log.address.toLowerCase() === deployment.poolManager.toLowerCase(),
          ),
        })
          .filter((log) => log.args.id === deployment.poolId)
          .at(-1);
        if (swap) setResult({ hash, chainId, price: tickPrice(swap.args.tick) });
      } catch {
        /* The confirmed explorer link remains available if the receipt RPC fails. */
      }
      await reads.refetch();
    }
  };
  return (
    <section className={`panel frame ${styles.card}`}>
      <Corners />
      <span className="eyebrow">Market swap</span>
      <h2>Trade the demo pool.</h2>
      <p>
        This is a real Uniswap v4 swap. Any swap that crosses an order&apos;s trigger fires it
        through Reactive Network.
      </p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Select<DestinationId>
          label="Chain"
          value={chainId}
          disabled={busy}
          options={[
            { value: 1301, label: 'Unichain Sepolia' },
            { value: 84532, label: 'Base Sepolia' },
          ]}
          onChange={(next) => {
            setSelected(next);
            onChainChange?.(next);
          }}
        />
        <Select
          label="Direction"
          value={sellEth ? 'eth' : 'usd'}
          disabled={busy}
          options={[
            { value: 'eth', label: 'Sell rdETH for rdUSD' },
            { value: 'usd', label: 'Sell rdUSD for rdETH' },
          ]}
          onChange={(next) => {
            const eth = next === 'eth';
            setSellEth(eth);
            setAmount(eth ? '1' : '3000');
          }}
        />
        <label>
          Amount ({symbol})
          <input
            inputMode="decimal"
            value={amount}
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
            aria-describedby="swap-errors"
          />
        </label>
        <div className={styles.chips}>
          {(sellEth ? ['0.5', '1', '2'] : ['1500', '3000', '6000']).map((size) => (
            <button type="button" key={size} disabled={busy} onClick={() => setAmount(size)}>
              {formatNumber(size)} {symbol}
            </button>
          ))}
        </div>
        <p>≈ moves price ~1–2 %. Maximum {sellEth ? '5 rdETH' : '15,000 rdUSD'}.</p>
        {address && (
          <p>
            Balance: {balance === undefined ? 'Loading…' : `${formatAmount(balance)} ${symbol}`}
          </p>
        )}
        {nearEdge && (
          <p className={styles.warning}>
            Price is within 10 % of a seeded range edge. A swap may fill partially at the edge.
          </p>
        )}
        <p id="swap-errors" role="status" aria-live="polite">
          {error ||
            (outOfRange
              ? 'Pool is outside its seeded range. Swaps are paused.'
              : stale
                ? 'Waiting for a fresh pool price before swapping.'
                : unavailable
                  ? 'Balance or allowance unavailable. Retrying…'
                  : '')}
        </p>
        {address ? (
          <>
            <p className={styles.note}>
              1 · Approve {symbol} {approved ? '✓' : ''} → 2 · Swap
              {walletChain !== chainId ? ` · Switch to ${chains[chainId].name} on submit` : ''}
            </p>
            <button
              className={styles.submit}
              disabled={
                busy ||
                Boolean(error) ||
                stale ||
                Boolean(outOfRange) ||
                balance === undefined ||
                allowance === undefined
              }
            >
              {busy ? 'Transaction in progress…' : approved ? 'Swap' : `Approve ${symbol}`}
            </button>
          </>
        ) : (
          <ConnectWallet />
        )}
      </form>
      {result && (
        <p role="status">
          Swap confirmed. Result price:{' '}
          {result.price === undefined ? 'unavailable' : `${formatPrice(result.price)} rdUSD`}.{' '}
          <a href={explorer(result.chainId, `tx/${result.hash}`)} target="_blank" rel="noreferrer">
            View swap ↗
          </a>
        </p>
      )}
    </section>
  );
}
