import { decodeEventLog } from 'viem';
import { reactiveAbi } from './abi';
import { reactive } from './deployments';
import { scanLogs } from './logs';
import { stage } from './timestamps';
import type { ReactiveEvent } from './model';
export async function readReactiveEvents(): Promise<ReactiveEvent[]> {
  const logs = await scanLogs(5318007, reactive.address, reactive.fromBlock);
  const events: ReactiveEvent[] = [];
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: reactiveAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    events.push({
      eventName: decoded.eventName,
      chainId: decoded.args.execChainId,
      orderId: decoded.args.orderId,
      stage: await stage(log, 5318007, decoded.eventName),
      ...('reason' in decoded.args ? { reason: decoded.args.reason } : {}),
      ...('trace' in decoded.args ? { trace: decoded.args.trace } : {}),
      ...('retries' in decoded.args ? { retries: decoded.args.retries } : {}),
    });
  }
  return events;
}
