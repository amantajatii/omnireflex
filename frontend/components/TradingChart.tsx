'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
  type AutoscaleInfo,
} from 'lightweight-charts';
import { chains, type DestinationId } from '@/lib/chains';
import type { CandleSnapshot, Granularity } from '@/lib/server-candles';
import type { MarketSnapshot } from '@/lib/server-market';
import type { OrderRow } from '@/lib/model';
import {
  dragPrice,
  executionMarkers,
  orderLevels,
  poolPoints,
  validPrice,
} from '@/lib/trading-chart';
import styles from './TradingChart.module.css';

const timeframes = [
  [60, '1m'],
  [300, '5m'],
  [900, '15m'],
  [3600, '1h'],
  [21600, '6h'],
  [86400, '1D'],
] as const;
const handleScroll = {
  mouseWheel: true,
  pressedMouseMove: true,
  horzTouchDrag: true,
  vertTouchDrag: false,
};
type Props = {
  snapshot?: CandleSnapshot;
  error?: string;
  market?: MarketSnapshot;
  marketError?: string;
  granularity: Granularity;
  setGranularity: (value: Granularity) => void;
  trigger: DestinationId;
  spot?: number;
  kind: string;
  lower: string;
  upper: string;
  trail: string;
  setLower: (value: string) => void;
  setUpper: (value: string) => void;
  orders: OrderRow[];
};
type Draft = { key: 'lower' | 'upper'; price: number; line: IPriceLine };
type ChartState = {
  chart: IChartApi;
  candles: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
  pool: ISeriesApi<'Line'>;
  markers: ISeriesMarkersPluginApi<Time>;
  lines: IPriceLine[];
  drafts: Draft[];
  dragging?: { key: Draft['key']; pointer: number };
  timeframe?: Granularity;
  fitted: boolean;
  ink: string;
};

export default function TradingChart(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<ChartState | undefined>(undefined);
  const latest = useRef(props);
  const [chartError, setChartError] = useState('');
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let state: ChartState;
    try {
      const chart = createChart(element, {
        width: element.clientWidth,
        height: element.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#ffffff' },
          textColor: '#151515',
          fontSize: 11,
        },
        rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.26 } },
        timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 4 },
        handleScroll,
      });
      const candles = chart.addSeries(CandlestickSeries, { priceLineVisible: false });
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.83, bottom: 0 }, visible: false });
      const pool = chart.addSeries(LineSeries, {
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      state = {
        chart,
        candles,
        volume,
        pool,
        markers: createSeriesMarkers(candles, []),
        lines: [],
        drafts: [],
        fitted: false,
        ink: '#151515',
      };
      api.current = state;
    } catch {
      void Promise.resolve().then(() =>
        setChartError('Chart unavailable. Use the price inputs to set your order.'),
      );
      return;
    }
    const paint = () => {
      const css = getComputedStyle(document.documentElement);
      const color = (token: string) => css.getPropertyValue(token).trim();
      const ink = color('--rx-ink'),
        paper = color('--rx-paper'),
        soft = color('--rx-soft');
      state.ink = ink;
      state.chart.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: paper },
          textColor: soft,
          fontFamily: css.getPropertyValue('--rx-font-mono').trim() || 'monospace',
        },
        grid: {
          vertLines: { color: color('--rx-line') },
          horzLines: { color: color('--rx-line') },
        },
        rightPriceScale: { borderColor: color('--rx-line-strong') },
        timeScale: { borderColor: color('--rx-line-strong') },
        crosshair: {
          vertLine: { color: soft, labelBackgroundColor: ink },
          horzLine: { color: soft, labelBackgroundColor: ink },
        },
      });
      state.candles.applyOptions({
        upColor: paper,
        downColor: ink,
        borderUpColor: ink,
        borderDownColor: ink,
        wickUpColor: ink,
        wickDownColor: ink,
      });
      state.volume.applyOptions({ color: color('--rx-muted') });
      state.pool.applyOptions({ color: soft });
      state.lines.forEach((line) =>
        line.applyOptions({ color: ink, axisLabelColor: ink, axisLabelTextColor: paper }),
      );
      state.markers.setMarkers(
        state.markers.markers().map((marker) => ({ ...marker, color: ink })),
      );
    };
    paint();
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', paint);
    const resize = new ResizeObserver(() => {
      if (element.clientWidth && element.clientHeight)
        state.chart.resize(element.clientWidth, element.clientHeight);
    });
    resize.observe(element);
    const hit = (event: { clientX: number; clientY: number; pointerType: string }) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      if (x < 0 || x > state.chart.paneSize().width || y < 0 || y > state.chart.paneSize().height)
        return;
      return state.drafts
        .map((draft) => ({ draft, y: state.candles.priceToCoordinate(draft.price) }))
        .filter(
          (item) =>
            item.y !== null && Math.abs(item.y - y) <= (event.pointerType === 'touch' ? 20 : 10),
        )
        .sort((a, b) => Math.abs(a.y! - y) - Math.abs(b.y! - y))[0]?.draft;
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const draft = hit(event);
      if (!draft) return;
      state.dragging = { key: draft.key, pointer: event.pointerId };
      state.chart.applyOptions({ handleScroll: false, handleScale: false });
      state.candles.priceScale().applyOptions({ autoScale: false });
      element.setPointerCapture(event.pointerId);
      element.style.cursor = 'ns-resize';
      event.preventDefault();
      event.stopPropagation();
    };
    const move = (event: PointerEvent) => {
      if (!state.dragging) {
        element.style.cursor = hit(event) ? 'ns-resize' : '';
        return;
      }
      if (event.pointerId !== state.dragging.pointer) return;
      const y = Math.max(
        0,
        Math.min(
          state.chart.paneSize().height,
          event.clientY - element.getBoundingClientRect().top,
        ),
      );
      const value = dragPrice(state.candles.coordinateToPrice(y));
      if (value !== undefined) {
        const draft = state.drafts.find((line) => line.key === state.dragging?.key);
        if (draft) {
          draft.price = Number(value);
          draft.line.applyOptions({ price: Number(value) });
        }
        const setter =
          state.dragging.key === 'lower' ? latest.current.setLower : latest.current.setUpper;
        setter(value);
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const up = (event: PointerEvent) => {
      if (!state.dragging || event.pointerId !== state.dragging.pointer) return;
      state.dragging = undefined;
      state.chart.applyOptions({ handleScroll, handleScale: true });
      state.candles.priceScale().applyOptions({ autoScale: true });
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      element.style.cursor = '';
      event.stopPropagation();
    };
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('pointermove', move, true);
    element.addEventListener('pointerup', up, true);
    element.addEventListener('pointercancel', up, true);
    element.addEventListener('lostpointercapture', up, true);
    const blockChartGesture = (event: Event) => {
      if (state.dragging) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const touchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (
        touch &&
        (state.dragging ||
          hit({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' }))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    element.addEventListener('touchstart', touchStart, { capture: true, passive: false });
    element.addEventListener('touchmove', blockChartGesture, { capture: true, passive: false });
    element.addEventListener('mousedown', blockChartGesture, true);
    return () => {
      theme.disconnect();
      media.removeEventListener('change', paint);
      resize.disconnect();
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('pointermove', move, true);
      element.removeEventListener('pointerup', up, true);
      element.removeEventListener('pointercancel', up, true);
      element.removeEventListener('lostpointercapture', up, true);
      element.removeEventListener('touchstart', touchStart, true);
      element.removeEventListener('touchmove', blockChartGesture, true);
      element.removeEventListener('mousedown', blockChartGesture, true);
      state.markers.detach();
      state.chart.remove();
      api.current = undefined;
    };
  }, []);

  useEffect(() => {
    const state = api.current;
    if (!state) return;
    const candles = props.snapshot?.candles ?? [];
    state.pool.setData(
      poolPoints(props.market?.points ?? []).map((point) => ({
        ...point,
        time: point.time as UTCTimestamp,
      })),
    );
    if (state.timeframe !== props.granularity) {
      state.fitted = false;
      state.timeframe = props.granularity;
    }
    state.candles.setData(
      candles.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp })),
    );
    state.volume.setData(
      candles.map((candle) => ({ time: candle.time as UTCTimestamp, value: candle.volume })),
    );
    state.markers.setMarkers(
      executionMarkers(
        props.orders.filter((order) => order.triggerChain === props.trigger),
        candles.map((c) => c.time),
        props.granularity,
      ).map((marker) => ({
        time: marker.time as UTCTimestamp,
        text: marker.text,
        color: state.ink,
        position: 'aboveBar',
        shape: 'arrowDown',
      })),
    );
    if (!state.fitted && candles.length) {
      const latestPoolTime = props.market?.points.at(-1)?.time ?? 0;
      state.chart.timeScale().setVisibleRange({
        from: candles[Math.max(0, candles.length - 100)].time as UTCTimestamp,
        to: Math.max(candles.at(-1)!.time, latestPoolTime) as UTCTimestamp,
      });
      state.fitted = true;
    }
  }, [props.snapshot, props.granularity, props.orders, props.trigger, props.market]);

  useEffect(() => {
    const state = api.current;
    if (!state) return;
    state.lines.forEach((line) => state.candles.removePriceLine(line));
    state.lines = [];
    state.drafts = [];
    const line = (price: number, title: string, lineStyle: LineStyle) => {
      const result = state.candles.createPriceLine({
        price,
        title,
        color: state.ink,
        lineWidth: 1,
        lineStyle,
        axisLabelVisible: true,
      });
      state.lines.push(result);
      return result;
    };
    if (validPrice(props.spot))
      line(props.spot, `${props.trigger === 1301 ? 'UNI' : 'BASE'} Pool`, LineStyle.Solid);
    for (const [key, title, enabled, price] of [
      ['lower', 'Stop · drag', ['stop', 'bracket'].includes(props.kind), Number(props.lower)],
      ['upper', 'Take · drag', ['take', 'bracket'].includes(props.kind), Number(props.upper)],
    ] as const) {
      if (enabled && validPrice(price))
        state.drafts.push({ key, price, line: line(price, title, LineStyle.LargeDashed) });
    }
    const trail = Number(props.trail);
    if (props.kind === 'trail' && validPrice(props.spot) && trail > 0 && trail < 100)
      line(props.spot * (1 - trail / 100), 'Trail · indicative', LineStyle.LargeDashed);
    for (const order of props.orders) {
      if (order.status === 'Open' && order.triggerChain === props.trigger)
        orderLevels(order).forEach((level) => line(level.price, level.title, LineStyle.Dashed));
    }
    const prices = state.lines.map((line) => line.options().price).filter(validPrice);
    state.candles.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const range = original();
        if (!range?.priceRange || !prices.length) return range;
        return {
          ...range,
          priceRange: {
            minValue: Math.min(range.priceRange.minValue, ...prices),
            maxValue: Math.max(range.priceRange.maxValue, ...prices),
          },
        };
      },
    });
  }, [props.spot, props.kind, props.lower, props.upper, props.trail, props.orders, props.trigger]);

  const message = chartError || props.error || props.snapshot?.error;
  return (
    <section className={styles.panel} aria-label="ETH/USD trading chart">
      <div className={styles.toolbar}>
        <strong>ETH / USD</strong>
        <div className={styles.timeframes} role="group" aria-label="Candle timeframe">
          {timeframes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={props.granularity === value}
              onClick={() => props.setGranularity(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.plot}>
        <div
          ref={container}
          className={styles.canvas}
          role="img"
          aria-label={`ETH/USD ${timeframes.find(([g]) => g === props.granularity)?.[1]} candles and volume. ${chains[props.trigger].name} trigger pool ${props.spot ?? 'unavailable'} rdUSD per rdETH. ${props.kind} order: stop ${props.lower || 'unset'}, take ${props.upper || 'unset'}. Drag Stop or Take lines, or use the labelled price inputs.`}
        />
        {(message || !props.snapshot?.candles.length) && (
          <p className={styles.overlay} role="status">
            {message || 'Loading ETH/USD candles…'}
          </p>
        )}
      </div>
      <div className={styles.legend}>
        <span>Hollow up / filled down · Coinbase ETH/USD · UTC</span>
        <span>Dotted: trigger pool · Drag dashed draft levels or edit price inputs</span>
        {props.kind === 'trail' && (
          <span>
            Trail preview uses current pool spot; active trailing orders follow their tracked peak.
          </span>
        )}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView
        </a>
        {(props.marketError || props.market?.error) && (
          <p role="status">{props.marketError || props.market?.error}</p>
        )}
      </div>
    </section>
  );
}
