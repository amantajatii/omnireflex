import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUnits, type Hex } from 'viem';

type Env = Record<string, string | undefined>;
const BOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function number(env: Env, name: string, fallback: number, integer = false): number {
  const n = Number(env[name] ?? fallback);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isSafeInteger(n))) {
    throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}`);
  }
  return n;
}

function units(env: Env, name: string, fallback: string, decimals = 18): bigint {
  const raw = env[name] ?? fallback;
  if (!/^\d+(\.\d+)?$/.test(raw) || (raw.split('.')[1]?.length ?? 0) > decimals) {
    throw new Error(`${name} must be a decimal with at most ${decimals} places`);
  }
  const n = parseUnits(raw, decimals);
  if (n <= 0n || n >= 2n ** 255n) throw new Error(`${name} out of range`);
  return n;
}

function url(env: Env, name: string, fallback: string): string {
  const value = env[name] ?? fallback;
  try { if (['http:', 'https:'].includes(new URL(value).protocol)) return value; } catch {}
  throw new Error(`${name} must be an HTTP URL`);
}

export function loadConfig(env: Env = process.env) {
  if (env.DRY_RUN !== undefined && !['0', '1'].includes(env.DRY_RUN)) throw new Error('invalid DRY_RUN');
  const dryRun = env.DRY_RUN === '1';
  const privateKey = env.BOT_PRIVATE_KEY as Hex | undefined;
  if ((!dryRun && !privateKey) || (privateKey !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(privateKey))) {
    throw new Error('BOT_PRIVATE_KEY must be a 32-byte hex key');
  }
  const chains = (env.CHAINS ?? '1301,84532').split(',').map((id) => Number(id.trim()));
  if (!chains.length || chains.some((id) => ![1301, 84532].includes(id)) || new Set(chains).size !== chains.length) {
    throw new Error('CHAINS must contain unique supported chain IDs');
  }
  const cfg = {
    dryRun, privateKey, chains,
    recordsDir: resolve(env.RECORDS_DIR ?? resolve(BOT_DIR, '../contracts/deployments')),
    rpc: {
      1301: url(env, 'UNICHAIN_RPC_URL', 'https://unichain-sepolia-rpc.publicnode.com'),
      84532: url(env, 'BASE_RPC_URL', 'https://base-sepolia-rpc.publicnode.com'),
    } as Record<number, string>,
    lasnaRpcUrl: url(env, 'LASNA_RPC_URL', 'https://lasna-rpc.rnk.dev/'),
    pollMs: number(env, 'POLL_MS', 5000, true),
    minSwapIntervalMs: number(env, 'MIN_SWAP_INTERVAL_MS', 30000, true),
    deviationBps: number(env, 'DEVIATION_BPS', 15),
    maxStepBps: number(env, 'MAX_STEP_BPS', 75),
    priceMin: number(env, 'PRICE_MIN', 500), priceMax: number(env, 'PRICE_MAX', 10000),
    maxInputEth: units(env, 'MAX_INPUT_ETH', '20'), maxInputUsd: units(env, 'MAX_INPUT_USD', '60000'),
    maxGas: units(env, 'MAX_GAS_GWEI', '5', 9), lreactFloor: units(env, 'LREACT_FLOOR', '0.5'),
    port: number(env, 'PORT', 8791, true),
  };
  if (cfg.priceMin >= cfg.priceMax || cfg.maxStepBps >= 10000 || cfg.port > 65535) {
    throw new Error('invalid price bounds, MAX_STEP_BPS, or PORT');
  }
  return cfg;
}
export type Config = ReturnType<typeof loadConfig>;
