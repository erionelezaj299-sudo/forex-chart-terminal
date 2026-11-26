import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCandles, fetchWatchlistQuotes, parseBiquoteCandles } from '../src/market-data.js';
import { calculateVolumeProfile } from '../src/indicator.js';

test('biquote candles use real tick counts, sorted by UTC timestamp', () => {
  const bar = (openTime, tickVolume) => ({ openTime, open: 1, high: 2, low: 0, close: 1, volume: 0, tickVolume });
  const payload = { symbol: 'EURUSD', interval: '4h', bars: [bar('2024-01-02T04:00:00Z', 20), bar('2024-01-02T00:00:00Z', 10)] };
  const data = parseBiquoteCandles(payload, 'EURUSD', '4h');
  assert.deepEqual(data.map(c => c.volume), [10, 20]);
  assert.equal(data[0].time, Date.parse('2024-01-02T00:00:00Z') / 1000);
  assert.deepEqual(calculateVolumeProfile(data, { zero: 2, one: 0 }, { vpRows: 2 }).bins, [15, 15]);
});

test('biquote profile rejects unavailable tick counts, never substituting zero real volume', () => {
  const payload = { symbol: 'XAUUSD', interval: '1m', bars: [{ openTime: '2024-01-02T00:00:00Z', open: 1, high: 2, low: 0, close: 1, volume: 0, tickVolume: 0 }] };
  const data = parseBiquoteCandles(payload, 'XAUUSD', '1min');
  assert.equal(data[0].volume, undefined);
  assert.match(calculateVolumeProfile(data, { zero: 2, one: 0 }).error, /unavailable/);
  assert.throws(() => parseBiquoteCandles(payload, 'EURUSD', '1min'), /unexpected/);
  payload.bars[0].tickVolume = -1;
  assert.throws(() => parseBiquoteCandles(payload, 'XAUUSD', '1min'), /invalid tick volume/);
});

test('biquote requests use its interval and never send a Twelve Data key', async () => {
  const original = globalThis.fetch;
  let url;
  globalThis.fetch = async value => {
    url = value;
    return { ok: true, json: async () => ({ symbol: 'AUDCAD', interval: '1d', bars: [{ openTime: '2024-01-02T00:00:00Z', open: 1, high: 2, low: 0, close: 1, tickVolume: 4 }] }) };
  };
  try {
    const data = await fetchCandles('biquote', 'AUDCAD', '1day', 'private-key', undefined, 5000);
    assert.equal(data[0].volume, 4);
    assert.match(url, /interval=1d/);
    assert.match(url, /limit=1000/);
    assert.doesNotMatch(url, /private-key/);
  } finally { globalThis.fetch = original; }
});

test('biquote 4H requests use hourly data and New York session boundaries', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let url;
  Date.now = () => Date.parse('2026-11-26T18:30:00Z');
  globalThis.fetch = async value => {
    url = new URL(value);
    return { ok: true, json: async () => ({ symbol: 'EURUSD', interval: '1h', bars: [
      { openTime: '2026-11-26T18:00:00Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 20 },
      { openTime: '2026-11-26T17:00:00Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 20 },
      { openTime: '2026-11-26T16:00:00Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 20 },
      { openTime: '2026-11-26T15:00:00Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 20 },
      { openTime: '2026-11-26T14:00:00Z', open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 20 },
    ] }) };
  };
  try {
    const data = await fetchCandles('biquote', 'EURUSD', '4h', '', undefined);
    assert.equal(url.searchParams.get('interval'), '1h');
    assert.deepEqual(data.map(c => c.time), [Date.parse('2026-11-26T14:00:00Z') / 1000, Date.parse('2026-11-26T18:00:00Z') / 1000]);
    assert.deepEqual(data.map(c => c.volume), [80, 20]);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});

test('watchlist returns provider prices and marks stale biquote quotes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    EURUSD: { mid: 1.09, stale: true, marketState: 'closed' },
    XAUUSD: { mid: null, stale: false },
  }) });
  try {
    const quotes = await fetchWatchlistQuotes('biquote', ['EURUSD', 'XAUUSD'], '', undefined);
    assert.deepEqual(quotes, { EURUSD: { price: 1.09, stale: true } });
  } finally { globalThis.fetch = original; }
});

test('Twelve Data watchlist handles partial failures without inventing quotes', async () => {
  const original = globalThis.fetch;
  let url;
  globalThis.fetch = async value => {
    url = new URL(value);
    return { ok: true, json: async () => ({
      'EUR/USD': { price: '1.1' },
      'XAU/USD': { status: 'error', message: 'Not available' },
    }) };
  };
  try {
    const quotes = await fetchWatchlistQuotes('twelvedata', ['EURUSD', 'XAUUSD'], 'key', undefined);
    assert.deepEqual(quotes, { EURUSD: { price: 1.1, stale: false } });
    assert.equal(url.searchParams.get('symbol'), 'EUR/USD,XAU/USD');
    assert.equal(url.searchParams.get('apikey'), 'key');
  } finally { globalThis.fetch = original; }
});

test('watchlist reports missing keys and provider errors', async () => {
  await assert.rejects(fetchWatchlistQuotes('twelvedata', ['EURUSD'], '', undefined), /API key/);
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    'EUR/USD': { status: 'error', message: 'Credit limit exceeded' },
  }) });
  try {
    await assert.rejects(fetchWatchlistQuotes('twelvedata', ['EURUSD'], 'key', undefined), /Credit limit exceeded/);
  } finally { globalThis.fetch = original; }
});
