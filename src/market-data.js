import { parseCandles } from './indicator.js';
import { fetchOandaCandles, fetchOandaQuotes } from './oanda.js';

const BIQUOTE_INTERVALS = {
  '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '4h': '4h', '1day': '1d',
};

export function parseBiquoteCandles(payload, symbol, timeframe) {
  if (!payload || payload.symbol !== symbol || payload.interval !== BIQUOTE_INTERVALS[timeframe] || !Array.isArray(payload.bars)) {
    throw new Error('biquote returned an unexpected symbol, timeframe, or response.');
  }
  return parseCandles(payload.bars.map(bar => {
    if (typeof bar.openTime !== 'string' || !/Z$/.test(bar.openTime)) throw new Error('biquote returned an invalid UTC timestamp.');
    if (bar.tickVolume !== undefined && bar.tickVolume !== null &&
        (typeof bar.tickVolume !== 'number' || !Number.isFinite(bar.tickVolume) || bar.tickVolume < 0)) {
      throw new Error('biquote returned an invalid tick volume.');
    }
    return {
      datetime: bar.openTime.slice(0, -1), open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      volume: bar.tickVolume > 0 ? bar.tickVolume : undefined,
    };
  }));
}

export async function fetchCandles(source, symbol, timeframe, key, signal, size = 500) {
  if (source === 'oanda') return fetchOandaCandles(key, symbol, timeframe, signal, size);
  let url;
  if (source === 'biquote') {
    const params = new URLSearchParams({ interval: BIQUOTE_INTERVALS[timeframe], limit: String(Math.min(size, 1000)) });
    url = `https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc?${params}`;
  } else if (source === 'twelvedata') {
    const params = new URLSearchParams({ symbol: `${symbol.slice(0, 3)}/${symbol.slice(3)}`, interval: timeframe, outputsize: String(size), timezone: 'UTC', apikey: key });
    url = `https://api.twelvedata.com/time_series?${params}`;
  } else throw new Error('Unknown market data provider.');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${source === 'biquote' ? 'biquote' : 'Twelve Data'} returned HTTP ${response.status}.`);
  const json = await response.json();
  if (json.status === 'error' || json.code) throw new Error(json.message || 'The data provider rejected the request.');
  return source === 'biquote' ? parseBiquoteCandles(json, symbol, timeframe) : parseCandles(json.values);
}

export async function fetchWatchlistQuotes(source, symbols, key, signal) {
  if (source === 'oanda') return fetchOandaQuotes(key, symbols, signal);
  let url;
  if (source === 'biquote') {
    const params = new URLSearchParams();
    for (const symbol of symbols) params.append('symbols', symbol);
    url = `https://biquote.io/api/latest?${params}`;
  } else if (source === 'twelvedata') {
    if (!key) throw new Error('Connect a Twelve Data API key first.');
    const pairs = symbols.map(symbol => `${symbol.slice(0, 3)}/${symbol.slice(3)}`);
    const params = new URLSearchParams({ symbol: pairs.join(','), apikey: key });
    url = `https://api.twelvedata.com/price?${params}`;
  } else throw new Error('Unknown market data provider.');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${source === 'biquote' ? 'biquote' : 'Twelve Data'} returned HTTP ${response.status}.`);
  const json = await response.json();
  if (json.status === 'error' || json.code) throw new Error(json.message || 'The data provider rejected the request.');
  const quotes = {}, errors = [];
  for (const symbol of symbols) {
    const keyName = source === 'biquote' ? symbol : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    const quote = source === 'twelvedata' && symbols.length === 1 && json.price !== undefined ? json : json[keyName];
    if (quote?.status === 'error') errors.push(quote.message || 'The data provider rejected a quote.');
    const raw = source === 'biquote' ? quote?.mid : quote?.price;
    if (raw === null || raw === undefined || raw === '') continue;
    const price = Number(raw);
    if (Number.isFinite(price) && price > 0) {
      quotes[symbol] = { price, stale: source === 'biquote' && (quote.stale === true || quote.marketState === 'closed') };
    }
  }
  if (!Object.keys(quotes).length && errors.length) throw new Error(errors[0]);
  return quotes;
}
