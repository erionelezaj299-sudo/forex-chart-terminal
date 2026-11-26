import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateForexFourHour, forexFourHourStart } from '../src/forex-session.js';

const seconds = value => Date.parse(value) / 1000;
const bar = (time, open, volume = 10) => ({ time: seconds(time), open, high: open + 2, low: open - 1, close: open + 1, volume });

test('four-hour bars follow New York close across daylight saving', () => {
  assert.equal(forexFourHourStart(seconds('2026-11-26T19:00:00Z')), seconds('2026-11-26T18:00:00Z'));
  assert.equal(forexFourHourStart(seconds('2026-07-26T18:00:00Z')), seconds('2026-07-26T17:00:00Z'));
});

test('aggregates complete hours and a current partial bar without inventing gaps', () => {
  const candles = [
    bar('2026-11-26T14:00:00Z', 10), bar('2026-11-26T15:00:00Z', 12),
    bar('2026-11-26T16:00:00Z', 11), bar('2026-11-26T17:00:00Z', 13),
    bar('2026-11-26T18:00:00Z', 14),
  ];
  assert.deepEqual(aggregateForexFourHour(candles, seconds('2026-11-26T18:30:00Z')), [
    { time: seconds('2026-11-26T14:00:00Z'), open: 10, high: 15, low: 9, close: 14, volume: 40 },
    { time: seconds('2026-11-26T18:00:00Z'), open: 14, high: 16, low: 13, close: 15, volume: 10 },
  ]);
  assert.deepEqual(aggregateForexFourHour([candles[0], candles[2], candles[3], candles[4]], seconds('2026-11-26T18:30:00Z')).map(c => c.time), [seconds('2026-11-26T18:00:00Z')]);
  assert.throws(() => aggregateForexFourHour([candles[0], candles[2]], seconds('2026-11-26T19:00:00Z')), /No complete/);
  assert.throws(() => aggregateForexFourHour([candles[4]], seconds('2026-11-26T19:30:00Z')), /No complete/);
});

test('missing hourly volume stays unavailable in an aggregated candle', () => {
  const candles = [bar('2026-11-26T14:00:00Z', 10), bar('2026-11-26T15:00:00Z', 11), bar('2026-11-26T16:00:00Z', 12), bar('2026-11-26T17:00:00Z', 13)];
  delete candles[1].volume;
  assert.equal(aggregateForexFourHour(candles, seconds('2026-11-26T18:00:00Z'))[0].volume, undefined);
});
