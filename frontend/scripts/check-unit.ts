export {};
await import('./check-core');
await import('./check-rpc');
await import('./check-cache');
await import('./check-scanner');

await import('./check-phase2');
await import('./check-market');
await import('./check-candles');
await import('../lib/trading-chart.test');
await import('../components/NewOrderState.test');

await import('./check-polled');
