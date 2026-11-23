// The core chart overlay follows the supplied Pine script's default settings.
export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 5, closeThreshold: 30, bias: 'Both', filterSmallSwings: true, minSwingAtr: 0.8,
  showStructure: true, showBos: true, showFib: true, fibRatio: 0.71, fibExtension: 13,
  bosColor: '#000000', bosWidth: 2, fibColor: '#000000', fibMainColor: '#e5d231', fibWidth: 2,
  showFib0: true, showFib1: true, showFibPrice: true,
  fib2Enabled: false, fib2: 0.618, fib3Enabled: false, fib3: 0.786,
  fib4Enabled: false, fib4: 0.5, fib5Enabled: false, fib5: 0.236,
  fib2Color: '#0000ff', fib3Color: '#800080', fib4Color: '#ff9800', fib5Color: '#008080',
  showFib618: false, showFib236: false,
  showFvg: true, fvgActiveLeg: true, fvgNearFib: false, fvgTolerance: 5, fvgExtension: 2,
  fvgColor: '#787b86', fvgBorder: '#363a45',
  showLiquidity: true, liquiditySensitivity: 2, showFractals: true, filterBW: true,
  majorOnly: true, majorThreshold: 1.5, majorLookback: 10,
  premiumEnabled: true, show4h: true, show1d: true, sensitivity4h: 5, sensitivity1d: 5, use1mPrice: true,
  color4h: '#3333ee', color1d: '#9933bb', width4h: 1, width1d: 2,
  showVp: true, vpRows: 128, vpUseLtf: true, vpEndAtExtreme: true, vpWidth: 18, vpOffset: 13, vpPoc: true,
  vpColor: '#808080', vpPocColor: '#808080', vpPocLineColor: '#000000', vpPocLineStyle: 'dashed', vpPocLineWidth: 2,
  scannerRows: 1, scannerMinScore: 0, scannerBosAge: 50, scannerLiqLookback: 30, scannerFvgTolerance: 5,
  scannerTimeframe: '1h', scannerHtf: '4h', scannerSymbols: 'AUDUSD,EURUSD,GBPUSD,NZDUSD,USDCAD,USDCHF,USDJPY,AUDCAD,EURAUD,EURGBP,GBPAUD,GBPCAD,GBPJPY,NZDCAD,EURJPY',
});

export function calculateStructure(candles, settings = {}) {
  const o = { ...DEFAULT_SETTINGS, ...(typeof settings === 'number' ? { sensitivity: settings } : settings) };
  const sensitivity = o.sensitivity;
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
      const minMove = i >= 13 ? atr * o.minSwingAtr : null;
      if (highPivot && (!o.filterSmallSwings || !lows.length || (minMove !== null && pivot.high - lows[0].price >= minMove))) {
        highs.unshift({ index: p, price: pivot.high });
        if (previousHigh !== null) labels.push({ index: p, price: pivot.high, text: pivot.high > previousHigh ? 'HH' : 'LH', high: true });
        previousHigh = pivot.high;
        if (highs.length > 50) highs.pop();
      }
      if (lowPivot && (!o.filterSmallSwings || !highs.length || (minMove !== null && highs[0].price - pivot.low >= minMove))) {
        lows.unshift({ index: p, price: pivot.low });
        if (previousLow !== null) labels.push({ index: p, price: pivot.low, text: pivot.low > previousLow ? 'HL' : 'LL', high: false });
        previousLow = pivot.low;
        if (lows.length > 50) lows.pop();
      }
    }
    const lp = i - o.liquiditySensitivity;
    if (lp >= o.liquiditySensitivity) {
      const pivot = candles[lp], window = candles.slice(lp - o.liquiditySensitivity, lp + o.liquiditySensitivity + 1);
      if (window.every((b, j) => j === o.liquiditySensitivity || pivot.high > b.high)) liquidityHighs.unshift({ index: lp, price: pivot.high });
      if (window.every((b, j) => j === o.liquiditySensitivity || pivot.low < b.low)) liquidityLows.unshift({ index: lp, price: pivot.low });
    }
    if (i >= 4) {
      const pivot = candles[i - 2], window = candles.slice(i - 4, i + 1);
      const top = o.filterBW ? window[0].high < pivot.high && window[1].high <= pivot.high && pivot.high >= window[3].high && pivot.high > window[4].high : window[0].high < window[1].high && window[1].high < pivot.high && pivot.high > window[3].high && window[3].high > window[4].high;
      const bottom = o.filterBW ? window[0].low > pivot.low && window[1].low >= pivot.low && pivot.low <= window[3].low && pivot.low < window[4].low : window[0].low > window[1].low && window[1].low > pivot.low && pivot.low < window[3].low && window[3].low < window[4].low;
      const nearby = candles.slice(Math.max(0, i - 2 - o.majorLookback), i + 1);
      if (top && (!o.majorOnly || (i >= 13 && pivot.high - Math.min(...nearby.map(b => b.low)) >= atr * o.majorThreshold))) fractals.push({ index: i - 2, price: pivot.high, high: true });
      if (bottom && (!o.majorOnly || (i >= 13 && Math.max(...nearby.map(b => b.high)) - pivot.low >= atr * o.majorThreshold))) fractals.push({ index: i - 2, price: pivot.low, high: false });
    }
    if (i >= 2 && c.low > candles[i - 2].high) gaps.push({ start: i - 2, end: i + o.fvgExtension, top: c.low, bottom: candles[i - 2].high });
    if (i >= 2 && c.high < candles[i - 2].low) gaps.push({ start: i - 2, end: i + o.fvgExtension, top: candles[i - 2].low, bottom: c.high });
  }
  if (!highs.length || !lows.length) return { labels, fractals, gaps: gaps.slice(-200), bos: null, fib: null, liquidity: null };
  const findBreak = (swings, direction) => {
    for (const swing of swings.slice(0, 21)) {
      for (let j = swing.index + 1; j < candles.length; j++) {
        const c = candles[j], range = c.high - c.low;
        const strong = range === 0 || (direction === 'bull' ? (c.close - c.low) / range : (c.high - c.close) / range) >= o.closeThreshold / 100;
        if (strong && (direction === 'bull' ? c.close > swing.price : c.close < swing.price)) {
          return { start: swing.index, end: j, price: swing.price, direction };
        }
      }
    }
    return null;
  };
  const bull = o.bias !== 'Bear' ? findBreak(highs, 'bull') : null, bear = o.bias !== 'Bull' ? findBreak(lows, 'bear') : null;
  const bos = bear && (!bull || bear.end > bull.end) ? bear : bull;
  if (!bos) return { labels, fractals, gaps: gaps.slice(-200), bos: null, fib: null, liquidity: null };
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
  if (!opposite) return { labels, fractals, gaps: gaps.slice(-200), bos, fib: null, liquidity };
  let extremeIndex = bos.end;
  for (let i = bos.end + 1; i < candles.length; i++) {
    if (bos.direction === 'bull' ? candles[i].high >= candles[extremeIndex].high : candles[i].low <= candles[extremeIndex].low) extremeIndex = i;
  }
  const zero = bos.direction === 'bull' ? candles[extremeIndex].high : candles[extremeIndex].low;
  const one = opposite.price;
  const fib = { start: opposite.index, extremeIndex, zero, one, level: zero + o.fibRatio * (one - zero) };
  const tolerance = Math.abs(one - zero) * o.fvgTolerance / 100;
  return { labels, fractals, gaps: gaps.slice(-200).filter(g => (!o.fvgActiveLeg || g.start >= fib.start) && (!o.fvgNearFib || (g.bottom <= fib.level + tolerance && g.top >= fib.level - tolerance))), bos, fib, liquidity };
}

export function parseCandles(values) {
  if (!Array.isArray(values)) throw new Error('The data provider returned no candle data.');
  const candles = values.map(v => {
    const date = String(v.datetime).replace(' ', 'T');
    const time = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : `${date}Z`) / 1000;
    if (['open', 'high', 'low', 'close'].some(key => v[key] === null || v[key] === undefined || v[key] === '')) throw new Error('The data provider returned an invalid candle.');
    const candle = { time, open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close) };
    if (!Object.values(candle).every(Number.isFinite) || candle.high < Math.max(candle.open, candle.close, candle.low) || candle.low > Math.min(candle.open, candle.close, candle.high)) throw new Error('The data provider returned an invalid candle.');
    if (v.volume !== undefined && v.volume !== null && v.volume !== '') {
      const volume = Number(v.volume);
      if (!Number.isFinite(volume) || volume < 0) throw new Error('The data provider returned invalid volume.');
      candle.volume = volume;
    }
    return candle;
  }).sort((a, b) => a.time - b.time);
  if (!candles.length || candles.some((c, i) => i > 0 && c.time === candles[i - 1].time)) throw new Error('The data provider returned empty or duplicate candles.');
  return candles;
}

// Pine VPFR: allocate each candle's full volume proportionally to price-row overlap.
export function calculateVolumeProfile(candles, fib, options = {}) {
  const o = { ...DEFAULT_SETTINGS, ...options };
  if (!fib) return { error: 'No active Fibonacci leg.' };
  const bottom = Math.min(fib.zero, fib.one), top = Math.max(fib.zero, fib.one);
  if (top <= bottom) return { error: 'The Fibonacci leg has no price range.' };
  if (!candles.length || candles.some(c => !Number.isFinite(c.volume))) return { error: 'Provider volume is unavailable for part or all of this leg.' };
  const rowHeight = (top - bottom) / o.vpRows, bins = Array(o.vpRows).fill(0);
  for (const c of candles) {
    if (c.volume <= 0) continue;
    const range = c.high - c.low;
    if (range <= 0) {
      if (c.high >= bottom && c.high <= top) bins[Math.min(o.vpRows - 1, Math.max(0, Math.floor((c.high - bottom) / rowHeight)))] += c.volume;
      continue;
    }
    const low = Math.max(c.low, bottom), high = Math.min(c.high, top);
    if (high <= low) continue;
    const first = Math.max(0, Math.min(o.vpRows - 1, Math.floor((low - bottom) / rowHeight)));
    const last = Math.max(0, Math.min(o.vpRows - 1, Math.floor((high - bottom) / rowHeight)));
    for (let i = first; i <= last; i++) {
      const rowLow = bottom + i * rowHeight;
      bins[i] += c.volume * Math.max(0, Math.min(high, rowLow + rowHeight) - Math.max(low, rowLow)) / range;
    }
  }
  const max = Math.max(...bins);
  if (max <= 0) return { error: 'No positive provider volume in the Fibonacci range.' };
  const pocIndex = bins.indexOf(max);
  return { bins, max, bottom, rowHeight, pocIndex, pocPrice: bottom + (pocIndex + 0.5) * rowHeight };
}

export function rangeStatus(result, price) {
  if (!result.fib) return 'Unavailable';
  const mid = (result.fib.zero + result.fib.one) / 2;
  return price > mid ? 'Premium' : price < mid ? 'Discount' : 'Neutral';
}
