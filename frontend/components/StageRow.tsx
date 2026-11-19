import { chains, explorer } from '@/lib/chains';
import { short, type Stage } from '@/lib/model';
import styles from './Detail.module.css';
export default function StageRow({
  label,
  stage,
  origin,
  index,
  timings,
  executed,
}: {
  label: string;
  stage?: Stage;
  origin?: Stage;
  index: number;
  timings?: [number | null, number | null, number | null];
  executed: boolean;
}) {
  const useMs = timings?.[0] != null && timings?.[2] != null;
  const seen = useMs ? timings?.[index] : null;
  const delta = useMs
    ? seen != null
      ? `${seen - timings![0]! >= 0 ? '+' : ''}${seen - timings![0]!} ms · indexer`
      : '— · indexer'
    : stage && origin
      ? `${stage.timestamp - origin.timestamp >= 0 ? '+' : ''}${stage.timestamp - origin.timestamp} s · block time`
      : '— · block time';
  return (
    <li>
      <div className={styles.stageHead}>
        <strong>{label}</strong>
        <span className="mono">{delta}</span>
      </div>
      {stage ? (
        <>
          <span>
            {chains[stage.chainId].name} · #{String(stage.block)}
          </span>
          <time className="mono" dateTime={new Date(stage.timestamp * 1000).toISOString()}>
            {new Date(stage.timestamp * 1000)
              .toISOString()
              .replace('T', ' ')
              .replace('.000Z', ' UTC')}
          </time>
          <a
            className="mono"
            href={explorer(stage.chainId, `tx/${stage.hash}`)}
            target="_blank"
            rel="noreferrer"
          >
            {short(stage.hash)} ↗
          </a>
        </>
      ) : (
        <p>
          {index === 1
            ? 'Reactive Lasna · block metadata unobserved. RVM logs may be unavailable.'
            : executed
              ? 'Block metadata unavailable.'
              : 'Awaiting execution.'}
        </p>
      )}
      {seen != null && (
        <time className="mono" dateTime={new Date(seen).toISOString()}>
          {new Date(seen).toISOString()} · indexer
        </time>
      )}
    </li>
  );
}
