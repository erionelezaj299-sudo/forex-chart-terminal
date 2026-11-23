export function parseLiveTick(tick, now = Date.now()) {
  const time = Date.parse(tick?.timestamp) / 1000;
  const price = Number(tick?.mid);
  if (typeof tick?.symbol !== 'string' || !Number.isFinite(time) || time > now / 1000 + 60 || !Number.isFinite(price) || price <= 0) return null;
  return { symbol: tick.symbol, time, price };
}

export function updateCurrentCandle(candles, tick, seconds) {
  const last = candles[candles.length - 1];
  if (!last || tick.time < last.time) return null;
  const time = last.time + Math.floor((tick.time - last.time) / seconds) * seconds;
  if (time === last.time) {
    return { ...last, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price };
  }
  return { time, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
}
