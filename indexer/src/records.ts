import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAddress } from 'viem';

export const UNICHAIN_ID = 1301;
export const BASE_ID = 84532;
export const LASNA_ID = 5318007;
export const DEST_CHAIN_IDS: readonly number[] = [UNICHAIN_ID, BASE_ID];

export type DestRecord = {
  chainId: number;
  poolManager: `0x${string}`;
  poolId: `0x${string}`;
  executor: `0x${string}`;
};
export type ReactiveRecord = { chainId: number; reactive: `0x${string}` };

function readJson(dir: string, chainId: number): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, `${chainId}.json`), 'utf8'));
}

function addr(rec: Record<string, unknown>, field: string, chainId: number): `0x${string}` {
  const v = rec[field];
  if (typeof v !== 'string' || !isAddress(v)) throw new Error(`record ${chainId}: bad ${field}`);
  return v as `0x${string}`;
}

export function loadDestRecord(dir: string, chainId: number): DestRecord {
  const rec = readJson(dir, chainId);
  const poolId = rec.poolId;
  if (typeof poolId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(poolId)) {
    throw new Error(`record ${chainId}: bad poolId`);
  }
  return {
    chainId,
    poolManager: addr(rec, 'poolManager', chainId),
    poolId: poolId.toLowerCase() as `0x${string}`,
    executor: addr(rec, 'executor', chainId),
  };
}

export function loadReactiveRecord(dir: string): ReactiveRecord {
  return { chainId: LASNA_ID, reactive: addr(readJson(dir, LASNA_ID), 'reactive', LASNA_ID) };
}
