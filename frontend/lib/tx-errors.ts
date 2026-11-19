import { BaseError, ContractFunctionRevertedError } from 'viem';

const MESSAGES: Record<string, string> = {
  FaucetEmpty: 'The faucet is out of demo tokens. Try again after it is refilled.',
  InvalidOrder: 'The order parameters are invalid. Check the amount and trigger prices.',
  OrderExpired: 'This order has expired.',
  OrderNotOpen: 'This order is no longer open.',
  OrderNotExpired: 'This order has not expired yet.',
  NotOrderOwner: 'Only the order owner can do this.',
  SlippageExceeded: 'The swap output is below your minimum. Try a higher slippage tolerance.',
  NoFeeRefund: 'There is no execution fee to refund for this order.',
  FeeRefundNotReady: 'The fee refund is not available yet. Try again after the 3 minute cooldown.',
  InsufficientFunds: 'Insufficient funds for this transaction.',
  InsufficientSurplus: 'The swap could not cover the order output. Try again later.',
  InvalidSwapDelta: 'The pool returned an unexpected swap result.',
  ETHTransferFailed: 'Sending ETH failed. Check the receiving address.',
  OnlySelf: 'This action is restricted to the contract itself.',
  OnlyPoolManager: 'This action is restricted to the pool manager.',
  SafeERC20FailedOperation: 'Token transfer failed. Check your balance and allowance.',
};

const pad = (value: number) => String(value).padStart(2, '0');

export function cooldownMessage(readyAt: bigint | number | string, nowSeconds: number) {
  const ready = Number(readyAt);
  if (!Number.isFinite(ready)) return 'Your claim is on cooldown.';
  const date = new Date(ready * 1000);
  const minutes = Math.max(1, Math.ceil((ready - nowSeconds) / 60));
  return `Next claim available at ${pad(date.getHours())}:${pad(date.getMinutes())} (in ${minutes} min)`;
}

/** Human-readable text for a known contract error name; raw args are never shown. */
export function revertMessage(
  name: string,
  args: readonly unknown[] = [],
  nowSeconds = Date.now() / 1000,
) {
  if (name === 'CooldownActive') return cooldownMessage(String(args[0]), nowSeconds);
  return MESSAGES[name] ?? `Transaction rejected by the contract (${name}).`;
}

export function transactionError(error: unknown) {
  const reverted =
    error instanceof BaseError
      ? error.walk((e) => e instanceof ContractFunctionRevertedError)
      : undefined;
  if (reverted instanceof ContractFunctionRevertedError && reverted.data)
    return revertMessage(reverted.data.errorName, reverted.data.args);
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : 'Transaction failed';
}
