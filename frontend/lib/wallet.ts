import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { chains } from './chains';
export const walletConfig = createConfig({
  chains: [chains[1301], chains[84532]],
  connectors: [injected()],
  transports: { 1301: http(), 84532: http() },
  ssr: true,
});
