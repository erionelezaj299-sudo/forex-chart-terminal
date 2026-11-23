import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveTick, updateCurrentCandle } from '../src/live-data.js';

test('validates streaming ticks and updates or opens a bar without inventing gaps', () => {
  const tick = parseLiveTick({ symbol: 'EURUSD', mid: 1.2, timestamp: '2024-01-01T00:01:00Z' }, Date.parse('2024-01-01T00:01:05Z'));
  assert.equal(tick.price, 1.2);
  assert.equal(parseLiveTick({ symbol: 'EURUSD', mid: 0, timestamp: 'bad' }), null);
  const candles = [{ time: tick.time - 60, open: 1, high: 1.1, low: 0.9, close: 1 }];
  assert.deepEqual(updateCurrentCandle(candles, tick, 300), { ...candles[0], high: 1.2, close: 1.2 });
  assert.deepEqual(updateCurrentCandle(candles, { ...tick, time: tick.time + 600 }, 300), { time: candles[0].time + 600, open: 1.2, high: 1.2, low: 1.2, close: 1.2 });
  assert.equal(updateCurrentCandle(candles, { ...tick, time: candles[0].time - 1 }, 300), null);
});
