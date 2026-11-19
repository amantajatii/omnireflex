import { setTimeout } from 'node:timers/promises';

export const log = (message: string) => console.log(`[pricebot] ${message}`);
export function errorMessage(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string } | null;
  return String(e?.shortMessage ?? e?.message ?? 'unknown error')
    .replace(/0x[0-9a-fA-F]{64}/g, '[redacted]').replace(/https?:\/\/\S+/g, '[endpoint]')
    .split('\n')[0].slice(0, 180);
}
export async function runLoop(step: () => Promise<void>, pollMs: number, signal: AbortSignal,
  onError: (message: string) => void): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    const started = Date.now();
    let wait = pollMs;
    try { await step(); failures = 0; wait = Math.max(0, pollMs - (Date.now() - started)); }
    catch (error) { onError(errorMessage(error)); wait = Math.min(60000, 1000 * 2 ** Math.min(failures++, 6)); }
    try { await setTimeout(wait, undefined, { signal }); } catch { return; }
  }
}
