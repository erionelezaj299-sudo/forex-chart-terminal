import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCandles, parseBiquoteCandles } from '../src/market-data.js';
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
