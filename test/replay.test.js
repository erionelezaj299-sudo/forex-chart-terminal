import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayableCandles, replaySnapshot } from '../src/replay.js';

const time = value => Date.parse(value) / 1000;
const bar = value => ({ time: time(value), open: 1, high: 2, low: 0.5, close: 1.5 });

test('replay excludes the still-forming candle and takes a snapshot', () => {
  const candles = [bar('2026-11-26T08:00:00Z'), bar('2026-11-26T12:00:00Z'), bar('2026-11-26T16:00:00Z')];
  const result = replayableCandles(candles, '4h', 'biquote', time('2026-11-26T18:00:00Z'));
  assert.equal(result.length, 2);
  candles[0].close = 99;
  assert.equal(result[0].close, 1.5);
});

test('replay limits chart, higher-timeframe and minute inputs to completed bars', () => {
  const candles = [bar('2026-11-26T08:00:00Z'), bar('2026-11-26T12:00:00Z'), bar('2026-11-26T16:00:00Z')];
  const higher = [candles, [bar('2026-11-25T00:00:00Z'), bar('2026-11-26T00:00:00Z')]];
  const minutes = [bar('2026-11-26T11:59:00Z'), bar('2026-11-26T12:00:00Z')];
  const result = replaySnapshot(candles, 0, higher, minutes, '4h', 'biquote');
  assert.equal(result.cutoff, time('2026-11-26T12:00:00Z'));
  assert.equal(result.visible.length, 1);
  assert.deepEqual(result.higher.map(bars => bars.length), [1, 1]);
  assert.deepEqual(result.minute.map(b => b.time), [minutes[0].time]);
  assert.throws(() => replaySnapshot(candles, 3, higher, minutes, '4h', 'biquote'), /position/);
});

test('replay respects the OANDA daily DST boundary', () => {
  const daily = [bar('2024-03-08T22:00:00Z'), bar('2024-03-09T22:00:00Z')];
  const result = replaySnapshot(daily, 1, [null, daily], null, '1day', 'oanda');
  assert.equal(result.cutoff, time('2024-03-10T21:00:00Z'));
  assert.equal(result.higher[1].length, 2);
});
