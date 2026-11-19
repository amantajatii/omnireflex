import { unichainSepolia, baseSepolia } from 'viem/chains';
import { recordRetryAfter } from './rpc-backoff';
import { createPublicClient, defineChain, http } from 'viem';

export const chains = {
  1301: defineChain({
    id: 1301,
    contracts: { multicall3: unichainSepolia.contracts.multicall3 },
    name: 'Unichain Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: {
        http: [process.env.NEXT_PUBLIC_UNICHAIN_RPC_URL || 'https://sepolia.unichain.org'],
      },
    },
    blockExplorers: { default: { name: 'Uniscan', url: 'https://sepolia.uniscan.xyz' } },
  }),
  84532: defineChain({
    id: 84532,
    contracts: { multicall3: baseSepolia.contracts.multicall3 },
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://sepolia.base.org'] },
    },
    blockExplorers: { default: { name: 'Basescan', url: 'https://sepolia.basescan.org' } },
  }),
  5318007: defineChain({
    id: 5318007,
    name: 'Reactive Lasna',
    nativeCurrency: { name: 'Lasna REACT', symbol: 'lREACT', decimals: 18 },
    rpcUrls: {
      default: { http: [process.env.NEXT_PUBLIC_LASNA_RPC_URL || 'https://lasna-rpc.rnk.dev/'] },
    },
    blockExplorers: { default: { name: 'Reactscan', url: 'https://lasna.reactscan.net' } },
  }),
} as const;
export type ChainId = keyof typeof chains;
export type DestinationId = 1301 | 84532;
export const destinationIds = [1301, 84532] as const;
const makeClient = (id: ChainId) =>
  createPublicClient({
    chain: chains[id],
    transport: http(chains[id].rpcUrls.default.http[0], { timeout: 12000, retryCount: 2 }),
  });
export const clients = {
  1301: makeClient(1301),
  84532: makeClient(84532),
  5318007: makeClient(5318007),
};

// eth_getLogs limits differ per public RPC (measured Nov 2026):
// sepolia.unichain.org ≤ 1,000 blocks (publicnode prunes Unichain history);
// sepolia.base.org ≤ 200 blocks at 200 ms/block, so Base logs go to publicnode (≤ 50,000);
// lasna-rpc.rnk.dev accepts 10,000 but not 100,000.
const logRpc: Record<ChainId, { url: string; span: bigint }> = {
  1301: {
    url: process.env.NEXT_PUBLIC_UNICHAIN_LOGS_RPC_URL || chains[1301].rpcUrls.default.http[0],
    span: 1_000n,
  },
  84532: {
    url: process.env.NEXT_PUBLIC_BASE_LOGS_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',
    span: 50_000n,
  },
  5318007: {
    url: process.env.NEXT_PUBLIC_LASNA_LOGS_RPC_URL || chains[5318007].rpcUrls.default.http[0],
    span: 10_000n,
  },
};
const makeLogClient = (id: ChainId) =>
  createPublicClient({
    chain: chains[id],
    transport: http(logRpc[id].url, {
      timeout: 15000,
      retryCount: 0,
      onFetchResponse: (response) => recordRetryAfter(id, response),
    }),
  });
export const logClients = {
  1301: makeLogClient(1301),
  84532: makeLogClient(84532),
  5318007: makeLogClient(5318007),
};
export const logSpan = (id: ChainId) => logRpc[id].span;
export const explorer = (id: ChainId, path: string) =>
  `${chains[id].blockExplorers.default.url}/${path}`;
export const docs = {
  architecture: '/reference/architecture',
  deployment: '/reference/deployment',
};
export const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL;
