import { useReadContracts } from 'wagmi';
import {
  decodeEventLog,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { deployments } from '@/lib/deployments';
import { poolAbi, executorAbi } from '@/lib/abi';
import { executorWriteAbi } from '@/lib/write-abi';
import type { DestinationId } from '@/lib/chains';
const REFRESH_MS = 15000;
export function useNewOrderReads(execution: DestinationId, token: Address, owner?: Address) {
  const deployment = deployments[execution];
  const slot = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [deployment.poolId, 6n]),
  );
  const publicReads = useReadContracts({
    contracts: [
      {
        chainId: execution,
        address: deployment.executor,
        abi: executorWriteAbi,
        functionName: 'executionPools',
        args: [deployment.poolId],
      },
      {
        chainId: execution,
        address: deployment.executor,
        abi: executorAbi,
        functionName: 'executionFee',
      },
      {
        chainId: execution,
        address: deployment.poolManager,
        abi: poolAbi,
        functionName: 'extsload',
        args: [slot],
      },
    ],
    query: { refetchInterval: REFRESH_MS },
  });
  const walletReads = useReadContracts({
    contracts: [
      {
        chainId: execution,
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner!],
      },
      {
        chainId: execution,
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner!, deployment.executor],
      },
    ],
    query: { enabled: !!owner, refetchInterval: REFRESH_MS },
  });
  const [poolRead, feeRead, priceRead] = publicReads.data ?? [];
  const [balanceRead, allowanceRead] = owner ? (walletReads.data ?? []) : [];
  const reads = {
    isError: publicReads.isError || (!!owner && walletReads.isError),
    refetch: () => Promise.all([publicReads.refetch(), owner ? walletReads.refetch() : undefined]),
  };
  return {
    reads,
    balance: balanceRead?.result,
    allowance: allowanceRead?.result,
    pool: poolRead?.result,
    fee: feeRead?.result,
    priceRead,
  };
}

type ReceiptLog = { address: string; data: Hex; topics: readonly Hex[] };
/** Finds the OrderCreated id among receipt logs; token transfer logs are skipped. */
export function createdOrderId(logs: readonly ReceiptLog[], executor: string) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== executor.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: executorAbi,
        eventName: 'OrderCreated',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      return event.args.orderId;
    } catch {
      /* Not an OrderCreated log. */
    }
  }
  return undefined;
}
