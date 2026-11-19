import uni from './records/1301.json';
import base from './records/84532.json';
import lasna from './records/5318007.json';
import type { Address, Hex } from 'viem';

function destination(record: typeof uni & { faucet?: string }, fromBlock: bigint) {
  if (
    record.poolKey.currency0.toLowerCase() !== record.rdUSD.toLowerCase() ||
    record.poolKey.currency1.toLowerCase() !== record.rdETH.toLowerCase()
  )
    throw new Error('Unexpected pool currency order');
  return {
    ...record,
    executor: record.executor as Address,
    faucet: record.faucet as Address | undefined,
    rdETH: record.rdETH as Address,
    rdUSD: record.rdUSD as Address,
    swapRouter: record.swapRouter as Address,
    poolKey: {
      ...record.poolKey,
      currency0: record.poolKey.currency0 as Address,
      currency1: record.poolKey.currency1 as Address,
      hooks: record.poolKey.hooks as Address,
    },
    poolManager: record.poolManager as Address,
    poolId: record.poolId as Hex,
    fromBlock,
  };
}
export const deployments = {
  1301: destination(uni, 68162670n),
  84532: destination(base, 60466612n),
};
export const reactive = { address: lasna.reactive as Address, fromBlock: 8661319n };
