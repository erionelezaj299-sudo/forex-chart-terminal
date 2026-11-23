import { DEFAULT_SETTINGS } from './indicator.js';

function isPivot(candles, index, sensitivity, side) {
  if (index < sensitivity || index + sensitivity >= candles.length) return false;
  const value = candles[index][side];
  for (let i = index - sensitivity; i <= index + sensitivity; i++) {
    if (i !== index && (side === 'high' ? candles[i].high >= value : candles[i].low <= value)) return false;
  }
  return true;
}

export function scannerLeg(candles, settings = {}) {
  const o = { ...DEFAULT_SETTINGS, ...settings };
  let lastHigh, lastLow, highUsed = -1, lowUsed = -1, direction = 0, high, low, bosBar;
  const history = [];
  for (let i = 0; i < candles.length; i++) {
    const p = i - o.sensitivity;
    if (isPivot(candles, p, o.sensitivity, 'high')) lastHigh = { price: candles[p].high, index: p };
    if (isPivot(candles, p, o.sensitivity, 'low')) lastLow = { price: candles[p].low, index: p };
    const c = candles[i], range = c.high - c.low;
    const up = range === 0 || (c.close - c.low) / range * 100 >= o.closeThreshold;
    const down = range === 0 || (c.high - c.close) / range * 100 >= o.closeThreshold;
    if (lastHigh && lastLow && c.close > lastHigh.price && up && lastHigh.index !== highUsed) {
      highUsed = lastHigh.index; direction = 1; bosBar = i; low = lastLow.price; high = c.high;
    } else if (lastHigh && lastLow && c.close < lastLow.price && down && lastLow.index !== lowUsed) {
      lowUsed = lastLow.index; direction = -1; bosBar = i; high = lastHigh.price; low = c.low;
    } else if (direction === 1) {
      high = Math.max(high, c.high);
      if (c.close < low) direction = 0;
    } else if (direction === -1) {
      low = Math.min(low, c.low);
      if (c.close > high) direction = 0;
    }
    history.push({ direction, high, low, bosBar });
  }
  return history;
}

export function scanSetup(candles, higherCandles, settings = {}) {
  const o = { ...DEFAULT_SETTINGS, ...settings };
  if (!candles.length || !higherCandles.length) return null;
  const leg = scannerLeg(candles, o).at(-1), higher = scannerLeg(higherCandles, o).at(-1);
  if (!leg.direction || leg.bosBar === undefined || !Number.isFinite(leg.high) || !Number.isFinite(leg.low)) return null;
  let lqHigh, lqLow, bullSweep, bearSweep;
  const gaps = [];
  for (let i = 0; i < candles.length; i++) {
    const p = i - o.liquiditySensitivity, c = candles[i];
    if (isPivot(candles, p, o.liquiditySensitivity, 'high')) lqHigh = candles[p].high;
    if (isPivot(candles, p, o.liquiditySensitivity, 'low')) lqLow = candles[p].low;
    if (lqLow !== undefined && c.low < lqLow) { if (c.close > lqLow) bullSweep = i; lqLow = undefined; }
    if (lqHigh !== undefined && c.high > lqHigh) { if (c.close < lqHigh) bearSweep = i; lqHigh = undefined; }
    if (i >= 2 && c.low > candles[i - 2].high) gaps.push({ top: c.low, bottom: candles[i - 2].high, bar: i - 2, direction: 1 });
    if (i >= 2 && c.high < candles[i - 2].low) gaps.push({ top: candles[i - 2].low, bottom: c.high, bar: i - 2, direction: -1 });
    if (gaps.length > 50) gaps.shift();
  }
  const last = candles.length - 1, sweep = leg.direction === 1 ? bullSweep : bearSweep;
  const bos = last - leg.bosBar <= o.scannerBosAge;
  const liquidity = sweep !== undefined && sweep >= leg.bosBar - o.scannerLiqLookback && last - sweep <= o.scannerLiqLookback + o.scannerBosAge;
  const p0 = leg.direction === 1 ? leg.high : leg.low, p1 = leg.direction === 1 ? leg.low : leg.high;
  const level = p0 + o.fibRatio * (p1 - p0), tolerance = Math.abs(leg.high - leg.low) * o.scannerFvgTolerance / 100;
  const fvg = gaps.some(g => g.direction === leg.direction && g.bar >= leg.bosBar - 2 && g.bottom <= level + tolerance && g.top >= level - tolerance);
  const mid = (higher.high + higher.low) / 2, price = candles[last].close;
  const alignment = Number.isFinite(mid) && (leg.direction === 1 ? price < mid : price > mid);
  return { direction: leg.direction, score: 25 * (Number(bos) + Number(liquidity) + Number(fvg) + Number(alignment)), bos, liquidity, fvg, alignment };
}
