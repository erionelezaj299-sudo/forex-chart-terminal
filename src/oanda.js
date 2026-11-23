import { parseCandles } from './indicator.js';

const granularities = { '1min': 'M1', '5min': 'M5', '15min': 'M15', '30min': 'M30', '1h': 'H1', '4h': 'H4', '1day': 'D' };

function baseUrl(config) {
  if (!config?.token || !config.account || !['practice', 'live'].includes(config.environment)) throw new Error('Enter your OANDA account ID and API token.');
  return config.environment === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
}
function instrument(symbol) { return `${symbol.slice(0, 3)}_${symbol.slice(3)}`; }
function parseQuote(quote, symbols) {
  const symbol = typeof quote.instrument === 'string' ? quote.instrument.replace('_', '') : '';
  const bid = Number(quote.bids?.[0]?.price), ask = Number(quote.asks?.[0]?.price), time = Date.parse(quote.time) / 1000;
  return symbols.includes(symbol) && bid > 0 && ask >= bid && Number.isFinite(time)
    ? { symbol, price: (bid + ask) / 2, stale: quote.status !== 'tradeable', time }
    : null;
}
async function request(config, path, signal) {
  const response = await fetch(`${baseUrl(config)}${path}`, {
    headers: { Authorization: `Bearer ${config.token}` }, signal, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`OANDA returned HTTP ${response.status}. Check your account, token and environment.`);
  return response.json();
}

export async function fetchOandaInstruments(config, signal) {
  const json = await request(config, `/v3/accounts/${encodeURIComponent(config.account)}/instruments`, signal);
  if (!Array.isArray(json.instruments)) throw new Error('OANDA returned an invalid instrument list.');
  return new Set(json.instruments.map(value => value.name).filter(name => typeof name === 'string').map(name => name.replace('_', '')));
}

export async function fetchOandaCandles(config, symbol, timeframe, signal, size = 500) {
  const granularity = granularities[timeframe];
  if (!granularity) throw new Error('Unsupported OANDA timeframe.');
  const params = new URLSearchParams({ granularity, price: 'M', count: String(Math.min(size, 5000)) });
  const json = await request(config, `/v3/instruments/${instrument(symbol)}/candles?${params}`, signal);
  if (json.instrument !== instrument(symbol) || json.granularity !== granularity || !Array.isArray(json.candles)) throw new Error('OANDA returned an unexpected candle response.');
  const values = json.candles.map(c => {
    const time = Date.parse(c.time);
    if (!Number.isFinite(time) || !c.mid || !Number.isInteger(c.volume) || c.volume < 0) throw new Error('OANDA returned an invalid candle.');
    return { datetime: new Date(time).toISOString().slice(0, -1), open: c.mid.o, high: c.mid.h, low: c.mid.l, close: c.mid.c, volume: c.volume };
  });
  return parseCandles(values);
}

export async function fetchOandaQuotes(config, symbols, signal) {
  baseUrl(config);
  if (!symbols.length) return {};
  const params = new URLSearchParams({ instruments: symbols.map(instrument).join(',') });
  const json = await request(config, `/v3/accounts/${encodeURIComponent(config.account)}/pricing?${params}`, signal);
  if (!Array.isArray(json.prices)) throw new Error('OANDA returned an invalid price response.');
  const quotes = {};
  for (const quote of json.prices) {
    const parsed = parseQuote(quote, symbols);
    if (parsed) { const { symbol, ...value } = parsed; quotes[symbol] = value; }
  }
  return quotes;
}

export async function streamOandaQuotes(config, symbols, signal, onOpen, onQuote) {
  baseUrl(config);
  if (!symbols.length) throw new Error('No OANDA instruments are available to stream.');
  const host = config.environment === 'practice' ? 'https://stream-fxpractice.oanda.com' : 'https://stream-fxtrade.oanda.com';
  const params = new URLSearchParams({ instruments: symbols.map(instrument).join(',') });
  const response = await fetch(`${host}/v3/accounts/${encodeURIComponent(config.account)}/pricing/stream?${params}`, {
    headers: { Authorization: `Bearer ${config.token}` }, signal, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`OANDA stream returned HTTP ${response.status}.`);
  if (!response.body) throw new Error('This browser does not support OANDA streaming.');
  onOpen();
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) throw new Error('OANDA stream returned an oversized message.');
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let json;
        try { json = JSON.parse(line); } catch { throw new Error('OANDA stream returned invalid JSON.'); }
        if (json.type === 'HEARTBEAT') continue;
        const quote = parseQuote(json, symbols);
        if (quote) onQuote(quote);
      }
    }
    if (!signal.aborted) throw new Error('OANDA price stream ended.');
  } finally { reader.releaseLock(); }
}
