'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi';
import { erc20Abi, parseEther, type Hash } from 'viem';
import { chains, type DestinationId } from '@/lib/chains';
import { formatAmount } from '@/lib/format';
import { deployments } from '@/lib/deployments';
import { executorWriteAbi } from '@/lib/write-abi';
import { useFeed } from '@/lib/feed';
import {
  buildOrder,
  type OrderParams,
  type ExitConditions,
  trailPercentToTicks,
} from '@/lib/order-encoding';
import { useTransaction } from '@/lib/transactions';
import { ConnectWallet } from './WalletCard';
import { isSystemStale } from '@/lib/action-logic';
import { capacityState, isHistorySyncing, orderCapacity, orderSteps } from './NewOrderState';
import { useCandles } from '@/lib/use-candles';
import { useMarket } from '@/lib/use-market';
import type { Granularity } from '@/lib/server-candles';
import TradingOrders from './TradingOrders';
import MarketTicker from './MarketTicker';
import NewOrderPreview from './NewOrderPreview';
import NewOrderFields from './NewOrderFields';
import { createdOrderId, useNewOrderReads } from './NewOrderReads';
import styles from './NewOrder.module.css';

const unixNow = () => Math.floor(Date.now() / 1000);
const TradingChart = dynamic(() => import('./TradingChart'), {
  ssr: false,
  loading: () => (
    <div className={styles.chartLoading} role="status">
      Loading trading chart…
    </div>
  ),
});
export default function NewOrder() {
  const account = useAccount(),
    feed = useFeed(),
    { switchChainAsync } = useSwitchChain(),
    { run, busy } = useTransaction();
  const [chain, setChain] = useState<DestinationId | undefined>();
  const execution = chain ?? (account.chainId === 84532 ? 84532 : 1301);
  const [remote, setRemote] = useState(false),
    trigger = remote ? (execution === 1301 ? 84532 : 1301) : execution;
  const [exits, setExits] = useState<ExitConditions>({ stop: true, take: false, trail: false }),
    [side, setSide] = useState<'eth' | 'usd'>('eth');
  const [amount, setAmount] = useState(''),
    [lower, setLower] = useState(''),
    [upper, setUpper] = useState('');
  const [trail, setTrail] = useState('2'),
    [slippage, setSlippage] = useState('5'),
    [hours, setHours] = useState(24);
  const [created, setCreated] = useState<{ chain: DestinationId; id: bigint }>(),
    [localError, setLocalError] = useState('');
  const deployment = deployments[execution],
    triggerDeployment = deployments[trigger];
  const client = usePublicClient({ chainId: execution });
  const token = side === 'eth' ? deployment.rdETH : deployment.rdUSD;
  const inputSymbol = side === 'eth' ? 'rdETH' : 'rdUSD';
  const [approved, setApproved] = useState<{ token: string; amount: bigint }>();
  const {
    reads,
    balance,
    allowance: chainAllowance,
    pool,
    fee,
    priceRead,
  } = useNewOrderReads(execution, token, account.address);
  // A confirmed approval counts immediately; the chain read may lag behind the receipt.
  const optimistic = approved?.token === token ? approved.amount : undefined;
  const allowance =
    chainAllowance === undefined
      ? undefined
      : optimistic !== undefined && optimistic > chainAllowance
        ? optimistic
        : chainAllowance;
  const triggerStale = isSystemStale(feed.systems[trigger], feed.now, feed.errors[trigger]);
  const spot = feed.systems[trigger]?.price,
    defaultLower = spot ? String(Number((spot * 0.98).toPrecision(8))) : '';
  const defaultUpper = spot ? String(Number((spot * 1.02).toPrecision(8))) : '';
  const low = lower || defaultLower,
    high = upper || defaultUpper;
  const capacity = orderCapacity(
    feed.orders,
    feed.reactiveEvents,
    trigger,
    triggerDeployment.poolId,
    account.address,
  );
  let params: OrderParams | undefined,
    error = '';
  try {
    if (!exits.stop && !exits.take && !exits.trail)
      throw new Error('Select at least one exit condition.');
    if (!amount) throw new Error('Enter an amount to continue.');
    if (!/^\d+(\.\d{1,18})?$/.test(amount))
      throw new Error('Enter a positive decimal amount with at most 18 decimal places.');
    const amountIn = parseEther(amount);
    if (amountIn <= 0n) throw new Error('Amount must be greater than zero.');
    if (
      balance === undefined ||
      allowance === undefined ||
      pool === undefined ||
      fee === undefined ||
      priceRead?.result === undefined
    )
      throw new Error('Waiting for wallet balances and execution-pool settings.');
    if (!pool[0]) throw new Error('This execution pool is not enabled.');
    if (amountIn < pool[1])
      throw new Error(`Minimum input is ${formatAmount(pool[1], inputSymbol)} ${inputSymbol}.`);
    if (amountIn > balance) throw new Error(`Insufficient ${inputSymbol} balance.`);
    if (!spot || !Number.isFinite(spot)) throw new Error('Waiting for the trigger pool price.');
    if (exits.stop && !(Number(low) > 0 && Number(low) < spot))
      throw new Error(
        `${side === 'eth' ? 'Stop' : 'Dip'} price must be positive and below the current price.`,
      );
    if (exits.take && !(Number(high) > spot))
      throw new Error(
        `${side === 'eth' ? 'Take' : 'Breakout'} price must be above the current price.`,
      );
    if (
      !slippage.trim() ||
      !Number.isFinite(Number(slippage)) ||
      Number(slippage) <= 0 ||
      Number(slippage) >= 100
    )
      throw new Error('Slippage must be greater than 0% and below 100%.');
    params = buildOrder({
      executionKey: deployment.poolKey,
      rdETH: deployment.rdETH,
      executionSqrtPriceX96: BigInt(priceRead.result) & ((1n << 160n) - 1n),
      trigger: {
        chainId: BigInt(trigger),
        key: triggerDeployment.poolKey,
        rdETH: triggerDeployment.rdETH,
        tick: feed.systems[trigger]!.tick,
      },
      exits,
      side,
      amountIn,
      distance: 200,
      trailTicks: exits.trail ? trailPercentToTicks(Number(trail)) : 0,
      lowerPrice: exits.stop ? Number(low) : undefined,
      upperPrice: exits.take ? Number(high) : undefined,
      slippageBps: Math.round(Number(slippage) * 100),
      expiry: BigInt(Math.floor(feed.now / 1000) + hours * 3600),
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Check the order fields.';
  }
  const syncing = isHistorySyncing(feed);
  const { blocked: capacityError, warning: capacityWarning } = capacityState(capacity, syncing);
  const staleWarning = triggerStale
    ? `Trigger price on ${chains[trigger].name} is stale or unavailable. Waiting for fresh data before you can submit.`
    : '';
  const approvalNeeded = !!params && allowance !== undefined && allowance < params.amountIn;
  const steps = orderSteps({
    connected: account.isConnected,
    allowance,
    amountIn: params?.amountIn,
    symbol: inputSymbol,
  });
  const disabled = busy || !!error || !!capacityError || triggerStale || !account.address;
  async function changeChain(value: DestinationId) {
    setChain(value);
    setLower('');
    setUpper('');
    setLocalError('');
    if (account.isConnected && account.chainId !== value)
      try {
        await switchChainAsync({ chainId: value });
      } catch {
        setLocalError(
          'Network switch cancelled. Select the execution network in your wallet before submitting.',
        );
      }
  }
  async function submit() {
    if (!params || disabled || fee === undefined) return;
    setLocalError('');
    const hash: Hash | undefined = approvalNeeded
      ? await run({
          chainId: execution,
          address: token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [deployment.executor, params.amountIn],
          success: 'Approval confirmed — now create the order',
        })
      : await run({
          chainId: execution,
          address: deployment.executor,
          abi: executorWriteAbi,
          functionName: 'createOrder',
          args: [{ ...params, expiry: BigInt(unixNow() + hours * 3600) }],
          value: fee,
        });
    if (!hash) return;
    if (approvalNeeded) setApproved({ token, amount: params.amountIn });
    else setApproved(undefined);
    void reads.refetch();
    if (!approvalNeeded && client) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        const id = createdOrderId(receipt.logs, deployment.executor);
        if (id !== undefined) setCreated({ chain: execution, id });
      } catch {
        setLocalError(
          'Order confirmed. Open My orders while its receipt details become available.',
        );
      }
    }
  }
  const watching =
    !!created &&
    feed.reactiveEvents.some(
      (e) =>
        e.chainId === BigInt(created.chain) &&
        e.orderId === created.id &&
        e.eventName === 'OrderMirrored',
    );
  const [granularity, setGranularity] = useState<Granularity>(60);
  const candles = useCandles(granularity);
  const { market, error: marketError } = useMarket(trigger);
  const mine = useMemo(
    () => feed.orders.filter((row) => row.owner.toLowerCase() === account.address?.toLowerCase()),
    [feed.orders, account.address],
  );
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>New order</h1>
        <p>Price triggers watch the {chains[trigger].name} pool.</p>
      </div>
      <MarketTicker
        stats={candles.snapshot?.stats}
        chainId={trigger}
        spot={spot}
        stale={triggerStale}
      />
      <div className={styles.layout}>
        <div className={styles.chartArea}>
          <TradingChart
            snapshot={candles.snapshot}
            error={candles.error}
            market={market}
            marketError={marketError}
            granularity={granularity}
            setGranularity={setGranularity}
            trigger={trigger}
            spot={spot}
            exits={exits}
            side={side}
            lower={low}
            upper={high}
            trail={trail}
            setLower={setLower}
            setUpper={setUpper}
            orders={mine}
          />
        </div>
        <div className={styles.orderEntry}>
          <form
            className={`panel ${styles.form}`}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <NewOrderFields
              execution={execution}
              trigger={trigger}
              exits={exits}
              setExits={setExits}
              remote={remote}
              setRemote={setRemote}
              side={side}
              setSide={(value) => {
                setSide(value);
                if (value === 'usd') setExits((current) => ({ ...current, trail: false }));
              }}
              amount={amount}
              setAmount={setAmount}
              low={low}
              high={high}
              setLower={setLower}
              setUpper={setUpper}
              trail={trail}
              setTrail={setTrail}
              slippage={slippage}
              setSlippage={setSlippage}
              hours={hours}
              setHours={setHours}
              spot={spot}
              balance={balance}
              pool={pool}
              inputSymbol={inputSymbol}
              changeChain={changeChain}
            />
            <div className={styles.notice} aria-live="polite">
              {localError ||
                (account.isConnected
                  ? error ||
                    capacityError ||
                    `${capacity.pool}/32 tracked in pool · ${capacity.owner}/4 for this wallet`
                  : 'Connect a wallet to check balances, approve tokens and create your order.')}
              {[staleWarning, capacityError ? '' : capacityWarning].filter(Boolean).map((text) => (
                <p key={text} className={styles.warning} role="status">
                  {text}
                </p>
              ))}
              {reads.isError && (
                <p>
                  Wallet reads failed.{' '}
                  <button type="button" onClick={() => void reads.refetch()}>
                    Retry
                  </button>
                </p>
              )}
            </div>
            <ol className={styles.steps}>
              {steps.labels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ol>
            {account.isConnected ? (
              <button className="button" type="submit" disabled={disabled}>
                {busy
                  ? 'Waiting for transaction…'
                  : approvalNeeded
                    ? `Approve ${inputSymbol}`
                    : 'Create order →'}
              </button>
            ) : (
              <ConnectWallet />
            )}
          </form>
          <NewOrderPreview
            params={params}
            exits={exits}
            side={side}
            amount={amount}
            execution={execution}
            trigger={trigger}
            lower={low}
            upper={high}
            trail={trail}
            hours={hours}
            fee={fee}
            created={created}
            watching={watching}
          />
        </div>
        <div className={styles.ordersArea}>
          <TradingOrders
            orders={mine}
            connected={!!account.address}
            loading={feed.loading}
            error={feed.historyError}
          />
        </div>
      </div>
    </div>
  );
}
