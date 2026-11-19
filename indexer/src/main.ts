import { loadConfig } from './config.ts';
import {
  BASE_ID,
  LASNA_ID,
  UNICHAIN_ID,
  loadDestRecord,
  loadReactiveRecord,
} from './records.ts';
import { createStore } from './store.ts';
import { createPersister } from './persist.ts';
import { createApp } from './server.ts';
import { newHealth, runChain, type ChainSpec } from './poller.ts';
import { destSpec, reactiveSpec } from './chains.ts';

const STALE_MS = 60_000;
const logErr =(m: string) => console.error(`[indexer] ${m}`);

function main(): void {
  const cfg = loadConfig();
  const specs: ChainSpec[] = [
    destSpec(loadDestRecord(cfg.recordsDir, UNICHAIN_ID), cfg.unichainRpcUrl),
    destSpec(loadDestRecord(cfg.recordsDir, BASE_ID), cfg.baseRpcUrl),
    reactiveSpec(loadReactiveRecord(cfg.recordsDir), cfg.lasnaRpcUrl),
  ];
  const store = createStore();
  const persister = createPersister(cfg.dataDir, store, logErr);
  persister.load();

  const healthByChain = new Map(specs.map((s) => [s.chainId, newHealth()]));
  const startedAt = Date.now();
  const abort = new AbortController();

  const app = createApp({
    store,
    health: () => ({
      ok: [...healthByChain.values()].every(
        (h) => h.lastPollAt !== null && Date.now() - Number(h.lastPollAt) < STALE_MS,
      ),
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      chains: Object.fromEntries(healthByChain),
      counts: store.counts(),
    }),
  });
  app.listen(cfg.port, () => {
    console.log(
      `[indexer] listening on :${cfg.port} chains=${specs.map((s) => s.chainId).join(',')} data=${persister.file}`,
    );
  });

  for (const spec of specs) {
    runChain(spec, {
      store,
      health: healthByChain.get(spec.chainId)!,
      pollMs: cfg.pollMs,
      maxLiveSpan: cfg.maxLiveSpan,
      onChange: persister.markDirty,
      log: logErr,
      signal: abort.signal,
    }).catch((err) => logErr(`chain ${spec.chainId} loop died: ${err?.message}`));
  }

  const shutdown = () => {
    abort.abort();
    persister.flush();
    app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (err) => logErr(`unhandled rejection: ${String(err)}`));
  process.on('uncaughtException', (err) => {
    logErr(`uncaught exception: ${err.message}`);
    persister.flush();
    process.exit(1);
  });
}

main();
