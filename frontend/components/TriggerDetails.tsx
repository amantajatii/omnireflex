import { triggerPrice, type OrderRow } from '@/lib/model';
import styles from './Detail.module.css';
import { formatPrice } from '@/lib/format';
export default function TriggerDetails({ order }: { order: OrderRow }) {
  const { trigger } = order;
  const bound = (tick: number, sentinel: number) =>
    tick === sentinel
      ? 'Disabled'
      : `${formatPrice(triggerPrice(tick, trigger.inverted))} rdUSD / rdETH`;
  return (
    <>
      <h3 className={styles.detailHeading}>Trigger bounds</h3>
      <dl className={styles.amounts}>
        <div>
          <dt>Lower · stop</dt>
          <dd>
            {bound(trigger.lowerTick, -8388608)}
            <br />
            <span className="mono">
              normalised {trigger.lowerTick} · raw{' '}
              {trigger.lowerTick === -8388608
                ? 'disabled'
                : trigger.inverted
                  ? -trigger.lowerTick
                  : trigger.lowerTick}
            </span>
          </dd>
        </div>
        <div>
          <dt>Upper · take</dt>
          <dd>
            {bound(trigger.upperTick, 8388607)}
            <br />
            <span className="mono">
              normalised {trigger.upperTick} · raw{' '}
              {trigger.upperTick === 8388607
                ? 'disabled'
                : trigger.inverted
                  ? -trigger.upperTick
                  : trigger.upperTick}
            </span>
          </dd>
        </div>
        <div>
          <dt>Trailing distance</dt>
          <dd>
            {trigger.trailTicks
              ? trigger.inverted
                ? `${formatPrice((1 - 1.0001 ** -trigger.trailTicks) * 100)}% below peak rdETH price`
                : `${formatPrice((1.0001 ** trigger.trailTicks - 1) * 100)}% above price at normalised peak`
              : 'Disabled'}
            <br />
            <span className="mono">
              {trigger.trailTicks} ticks · {trigger.inverted ? 'inverted' : 'normal'} orientation
            </span>
          </dd>
        </div>
        <div>
          <dt>Expiry</dt>
          <dd>
            {order.expiry
              ? new Date(Number(order.expiry) * 1000)
                  .toISOString()
                  .replace('T', ' ')
                  .replace('.000Z', ' UTC')
              : 'No expiry'}
          </dd>
        </div>
      </dl>
      <p className={styles.skew}>
        Bounds are normalised ticks; raw pool tick ={' '}
        {trigger.inverted ? '−normalised tick' : 'normalised tick'}. A trailing threshold follows
        the observed peak; it has no fixed absolute price.
      </p>
    </>
  );
}
