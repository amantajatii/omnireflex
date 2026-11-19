import { createPublicClient, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadConfig } from './config.ts';
import { loadDestRecord, loadReactiveRecord } from './records.ts';
import { createFeed } from './feed.ts';
import { newHealth, runChain } from './chain.ts';
import { errorMessage, log, runLoop } from './runtime.ts';
import { createApp } from './server.ts';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const records = cfg.chains.map((id) => loadDestRecord(cfg.recordsDir, id));
  const reactive = loadReactiveRecord(cfg.recordsDir);
  const account = cfg.dryRun ? undefined : privateKeyToAccount(cfg.privateKey!);
  const abort = new AbortController();
  const state = { address: account?.address ?? null, dryRun: cfg.dryRun, paused: true,
    lreact: null as string | null, refPrice: null as number | null,
    chains: Object.fromEntries(records.map((rec) => [rec.chainId, newHealth()])) };
  const getFeed = createFeed(abort.signal, log);
  const feed = async () => { state.refPrice = await getFeed(); return state.refPrice; };
  const lasna = createPublicClient({ transport: http(cfg.lasnaRpcUrl, { timeout: 8000, retryCount: 0 }) });
  const app = createApp(() => state);
  const shutdown = () => { abort.abort(); app.close(); app.closeAllConnections(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  process.on('unhandledRejection', (error) => log(`unhandled rejection: ${errorMessage(error)}`));
  app.on('error', (error) => { log(`server: ${errorMessage(error)}`); shutdown(); process.exitCode = 1; });
  app.listen(cfg.port, () => log(`listening on :${cfg.port} dryRun=${cfg.dryRun}`));
  log(`address ${state.address ?? 'null'}`);
  const guardStep = async () => {
    const balance = await lasna.getBalance({ address: reactive });
    state.lreact = formatEther(balance);
    const paused = balance < cfg.lreactFloor;
    if (paused !== state.paused || !guardRead) log(`lREACT=${state.lreact} ${paused ? 'paused' : 'resumed'}`);
    state.paused = paused; guardRead = true; lastGuardOk = Date.now();
  };
  let guardRead = false;
  let lastGuardOk = 0;
  const GUARD_STALE_MS = 5 * 60_000;
  const guard = runLoop(async () => {
    try { await guardStep(); } catch (error) {
      log(`lREACT guard: ${errorMessage(error)}`);
      // Fail closed: without a recent balance read we cannot know the reactive contract is funded.
      if (!state.paused && Date.now() - lastGuardOk > GUARD_STALE_MS) {
        state.paused = true;
        log('lREACT guard stale; paused');
      }
    }
  }, 60000, abort.signal, (message) => log(`lREACT guard: ${message}`));
  const loops = records.map((rec) => runChain(rec, cfg, account, state.chains[rec.chainId], feed,
    () => state.paused, abort.signal));
  await Promise.all([guard, ...loops]);
}
main().catch((error) => { log(`startup: ${errorMessage(error)}`); process.exitCode = 1; });
