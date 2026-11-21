import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeAbiParameters, isAddress, keccak256, zeroAddress, type Address, type Hex } from 'viem';

function read(dir: string, id: number): Record<string, any> {
  const rec = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) throw new Error(`record ${id}: invalid object`);
  return rec;
}
function address(rec: Record<string, any>, field: string, allowZero = false): Address {
  const value = rec[field];
  if (typeof value !== 'string' || !isAddress(value) || (!allowZero && value === zeroAddress)) {
    throw new Error(`invalid record address: ${field}`);
  }
  return value;
}
export function validateDest(rec: Record<string, any>, id: number) {
  if (rec.chainId !== id || ![1301, 84532].includes(id)) throw new Error('invalid record chainId');
  const key = rec.poolKey;
  if (!key || !Number.isInteger(key.fee) || key.fee < 0 || key.fee > 0xffffff
    || !Number.isInteger(key.tickSpacing) || key.tickSpacing <= 0 || key.tickSpacing > 32767) {
    throw new Error('invalid poolKey');
  }
  const poolKey = { currency0: address(key, 'currency0'), currency1: address(key, 'currency1'),
    fee: key.fee as number, tickSpacing: key.tickSpacing as number, hooks: address(key, 'hooks', true) };
  const rdETH = address(rec, 'rdETH'), rdUSD = address(rec, 'rdUSD');
  const tokens = [rdETH.toLowerCase(), rdUSD.toLowerCase()].sort();
  if (tokens[0] === tokens[1] || tokens[0] !== poolKey.currency0.toLowerCase()
    || tokens[1] !== poolKey.currency1.toLowerCase()) throw new Error('pool token mismatch');
  const poolId = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
  ));
  if (typeof rec.poolId !== 'string' || rec.poolId.toLowerCase() !== poolId) throw new Error('invalid poolId');
  return { chainId: id, poolKey, poolId: poolId as Hex, rdETH, rdUSD,
    executor: address(rec, 'executor'), poolManager: address(rec, 'poolManager'), swapRouter: address(rec, 'swapRouter') };
}
export const loadDestRecord = (dir: string, id: number) => validateDest(read(dir, id), id);
export const loadReactiveRecord = (dir: string) => address(read(dir, 5318007), 'reactive');
export type DestRecord = ReturnType<typeof loadDestRecord>;
