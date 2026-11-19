import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Config = {
  port: number;
  dataDir: string;
  recordsDir: string;
  unichainRpcUrl: string;
  baseRpcUrl: string;
  lasnaRpcUrl: string;
  pollMs: number;
  maxLiveSpan: number;
};

const INDEXER_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));

function intEnv(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: intEnv(env, 'PORT', 8790),
    dataDir: resolve(env.DATA_DIR || './data'),
    recordsDir: env.RECORDS_DIR
      ? resolve(env.RECORDS_DIR)
      : resolve(INDEXER_DIR, '../contracts/deployments'),
    unichainRpcUrl: env.UNICHAIN_RPC_URL || 'https://unichain-sepolia-rpc.publicnode.com',
    baseRpcUrl: env.BASE_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',
    lasnaRpcUrl: env.LASNA_RPC_URL || 'https://lasna-rpc.rnk.dev/',
    pollMs: intEnv(env, 'POLL_MS', 400),
    maxLiveSpan: intEnv(env, 'MAX_LIVE_SPAN', 25),
  };
}
