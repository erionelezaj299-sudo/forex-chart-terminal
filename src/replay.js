import { candleEnd } from './candle-clock.js';

export function replayableCandles(candles, interval, provider, now = Date.now() / 1000) {
  return candles.filter(candle => {
    const end = candleEnd(candle.time, interval, provider);
    return end !== null && end <= now;
  }).map(candle => ({ ...candle }));
}

export function replaySnapshot(candles, index, higher, minute, interval, provider) {
  if (!Number.isInteger(index) || index < 0 || index >= candles.length) throw new RangeError('Invalid replay position.');
  const visible = candles.slice(0, index + 1);
  const cutoff = candleEnd(visible[visible.length - 1].time, interval, provider);
  if (cutoff === null) throw new Error('Unable to determine replay candle close.');
  const closed = (bars, timeframe) => bars?.filter(bar => {
    const end = candleEnd(bar.time, timeframe, provider);
    return end !== null && end <= cutoff;
  }) ?? null;
  return { visible, cutoff, higher: higher.map((bars, i) => closed(bars, i === 0 ? '4h' : '1day')), minute: closed(minute, '1min') };
}
