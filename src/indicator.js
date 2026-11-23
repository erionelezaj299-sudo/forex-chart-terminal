// The core chart overlay follows the supplied Pine script's default settings.
export function calculateStructure(candles, sensitivity = 5) {
  const highs = [], lows = [], labels = [], gaps = [], fractals = [], liquidityHighs = [], liquidityLows = [];
  let atr = null, previousHigh = null, previousLow = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i], prior = candles[i - 1];
    const tr = prior ? Math.max(c.high - c.low, Math.abs(c.high - prior.close), Math.abs(c.low - prior.close)) : c.high - c.low;
    if (i < 14) {
      atr = (atr ?? 0) + tr;
      if (i === 13) atr /= 14;
    } else atr = (atr * 13 + tr) / 14;
    const p = i - sensitivity;
    if (p >= sensitivity) {
      const pivot = candles[p], window = candles.slice(p - sensitivity, p + sensitivity + 1);
      const highPivot = window.every((b, j) => j === sensitivity || pivot.high > b.high);
      const lowPivot = window.every((b, j) => j === sensitivity || pivot.low < b.low);
      const minMove = i >= 13 ? atr * 0.8 : 0;
      if (highPivot && (!lows.length || pivot.high - lows[0].price >= minMove)) {
        highs.unshift({ index: p, price: pivot.high });
        if (previousHigh !== null) labels.push({ index: p, price: pivot.high, text: pivot.high > previousHigh ? 'HH' : 'LH', high: true });
        previousHigh = pivot.high;
        if (highs.length > 50) highs.pop();
      }
      if (lowPivot && (!highs.length || highs[0].price - pivot.low >= minMove)) {
        lows.unshift({ index: p, price: pivot.low });
        if (previousLow !== null) labels.push({ index: p, price: pivot.low, text: pivot.low > previousLow ? 'HL' : 'LL', high: false });
        previousLow = pivot.low;
        if (lows.length > 50) lows.pop();
      }
    }
    if (i >= 4) {
      const pivot = candles[i - 2], window = candles.slice(i - 4, i + 1);
      if (window.every((b, j) => j === 2 || pivot.high > b.high)) liquidityHighs.unshift({ index: i - 2, price: pivot.high });
      if (window.every((b, j) => j === 2 || pivot.low < b.low)) liquidityLows.unshift({ index: i - 2, price: pivot.low });
      const top = window[0].high < pivot.high && window[1].high <= pivot.high && pivot.high >= window[3].high && pivot.high > window[4].high;
      const bottom = window[0].low > pivot.low && window[1].low >= pivot.low && pivot.low <= window[3].low && pivot.low < window[4].low;
      const nearby = candles.slice(Math.max(0, i - 12), i + 1);
      if (i >= 13 && top && pivot.high - Math.min(...nearby.map(b => b.low)) >= atr * 1.5) fractals.push({ index: i - 2, price: pivot.high, high: true });
      if (i >= 13 && bottom && Math.max(...nearby.map(b => b.high)) - pivot.low >= atr * 1.5) fractals.push({ index: i - 2, price: pivot.low, high: false });
    }
    if (i >= 2 && c.low > candles[i - 2].high) gaps.push({ start: i - 2, end: i + 2, top: c.low, bottom: candles[i - 2].high });
    if (i >= 2 && c.high < candles[i - 2].low) gaps.push({ start: i - 2, end: i + 2, top: candles[i - 2].low, bottom: c.high });
  }
  if (!highs.length || !lows.length) return { labels, fractals, gaps: [], bos: null, fib: null, liquidity: null };
  const findBreak = (swings, direction) => {
    for (const swing of swings.slice(0, 21)) {
      for (let j = swing.index + 1; j < candles.length; j++) {
        const c = candles[j], range = c.high - c.low;
        const strong = range === 0 || (direction === 'bull' ? (c.close - c.low) / range : (c.high - c.close) / range) >= 0.3;
        if (strong && (direction === 'bull' ? c.close > swing.price : c.close < swing.price)) {
          return { start: swing.index, end: j, price: swing.price, direction };
        }
      }
    }
    return null;
  };
  const bull = findBreak(highs, 'bull'), bear = findBreak(lows, 'bear');
  const bos = bear && (!bull || bear.end > bull.end) ? bear : bull;
  if (!bos) return { labels, fractals, gaps: [], bos: null, fib: null, liquidity: null };
  let liquidity = null;
  for (const pivot of (bos.direction === 'bull' ? liquidityLows : liquidityHighs).slice(0, 50)) {
    if (pivot.index > bos.end) continue;
    for (let i = pivot.index + 1; i <= bos.end; i++) {
      if (bos.direction === 'bull' ? candles[i].low < pivot.price : candles[i].high > pivot.price) {
        liquidity = { start: pivot.index, end: i, price: pivot.price };
        break;
      }
    }
    if (liquidity) break;
  }
  const opposite = (bos.direction === 'bull' ? lows : highs).find(p => p.index < bos.end);
  if (!opposite) return { labels, fractals, gaps: [], bos, fib: null, liquidity };
  let extremeIndex = bos.end;
  for (let i = bos.end + 1; i < candles.length; i++) {
    if (bos.direction === 'bull' ? candles[i].high >= candles[extremeIndex].high : candles[i].low <= candles[extremeIndex].low) extremeIndex = i;
  }
  const zero = bos.direction === 'bull' ? candles[extremeIndex].high : candles[extremeIndex].low;
  const one = opposite.price;
  const fib = { start: opposite.index, extremeIndex, zero, one, level: zero + 0.71 * (one - zero) };
  return { labels, fractals, gaps: gaps.slice(-200).filter(g => g.start >= fib.start), bos, fib, liquidity };
}

export function parseCandles(values) {
  if (!Array.isArray(values)) throw new Error('The data provider returned no candle data.');
  const candles = values.map(v => {
    const date = String(v.datetime).replace(' ', 'T');
    const time = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : `${date}Z`) / 1000;
    const candle = { time, open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close) };
    if (!Object.values(candle).every(Number.isFinite) || candle.high < Math.max(candle.open, candle.close, candle.low) || candle.low > Math.min(candle.open, candle.close, candle.high)) throw new Error('The data provider returned an invalid candle.');
    return candle;
  }).sort((a, b) => a.time - b.time);
  if (!candles.length || candles.some((c, i) => i > 0 && c.time === candles[i - 1].time)) throw new Error('The data provider returned empty or duplicate candles.');
  return candles;
}

export function rangeStatus(result, price) {
  if (!result.fib) return 'Unavailable';
  const mid = (result.fib.zero + result.fib.one) / 2;
  return price > mid ? 'Premium' : price < mid ? 'Discount' : 'Neutral';
}
