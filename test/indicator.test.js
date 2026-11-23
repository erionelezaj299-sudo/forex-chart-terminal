import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStructure, calculateVolumeProfile, calculateHigherTimeframeRange, higherTimeframeStatus, profileCandles, findFibExtreme, parseCandles, rangeStatus } from '../src/indicator.js';

test('parses UTC candles in chronological order and rejects malformed data', () => {
  const candles = parseCandles([
    { datetime: '2024-01-02 12:00:00', open: '2', high: '3', low: '1', close: '2.5' },
    { datetime: '2024-01-02 11:00:00', open: '1', high: '2', low: '0.5', close: '1.5' },
  ]);
  assert.equal(candles[0].time, Date.parse('2024-01-02T11:00:00Z') / 1000);
  assert.equal(candles[1].close, 2.5);
  assert.throws(() => parseCandles([{ datetime: 'bad', open: '1', high: '2', low: '0', close: '1' }]), /invalid/);
  assert.throws(() => parseCandles([]), /empty/);
});

test('calculates the latest bullish break and its Fibonacci leg', () => {
  const prices = [5,4,3,4,5,7,6,5,4,5,6,8,9,8,7];
  const candles = prices.map((price, time) => ({ time, open: price, high: price + 0.4, low: price - 0.4, close: price + 0.2 }));
  const result = calculateStructure(candles, { sensitivity: 2, filterSmallSwings: false });
  assert.equal(result.bos.direction, 'bull');
  assert.equal(result.bos.end, 11);
  assert.equal(result.fib.start, 8);
  assert.ok(Math.abs(result.fib.level - (9.4 + 0.71 * (3.6 - 9.4))) < 1e-10);
  assert.equal(rangeStatus(result, 9), 'Premium');
  assert.equal(rangeStatus(result, 4), 'Discount');
});

test('respects bias, ratio, and gap settings', () => {
  const prices = [5,4,3,4,5,7,6,5,4,5,6,8,9,8,7];
  const candles = prices.map((price, time) => ({ time, open: price, high: price + 0.4, low: price - 0.4, close: price + 0.2 }));
  const options = { sensitivity: 2, filterSmallSwings: false, fibRatio: 0.5 };
  const result = calculateStructure(candles, options);
  assert.ok(Math.abs(result.fib.level - (9.4 + 3.6) / 2) < 1e-10);
  assert.equal(calculateStructure(candles, { ...options, bias: 'Bear' }).bos, null);
});

test('volume profile distributes full candle volume proportionally and picks first POC tie', () => {
  const fib = { zero: 10, one: 0 };
  const profile = calculateVolumeProfile([
    { low: -5, high: 5, volume: 100 },
    { low: 5, high: 10, volume: 50 },
    { low: 11, high: 12, volume: 100 },
  ], fib, { vpRows: 2 });
  assert.deepEqual(profile.bins, [50, 50]);
  assert.equal(profile.pocIndex, 0);
  assert.equal(profile.pocPrice, 2.5);
  const point = calculateVolumeProfile([{ low: 10, high: 10, volume: 10 }], fib, { vpRows: 2 });
  assert.deepEqual(point.bins, [0, 10]);
});

test('volume profile refuses absent or nonpositive volume instead of inventing it', () => {
  const fib = { zero: 10, one: 0 };
  assert.match(calculateVolumeProfile([{ low: 0, high: 10 }], fib).error, /volume is unavailable/);
  assert.match(calculateVolumeProfile([{ low: 0, high: 10, volume: 0 }], fib).error, /No positive/);
  assert.match(calculateVolumeProfile([], fib).error, /volume is unavailable/);
  assert.equal(parseCandles([{ datetime: '2024-01-02', open: 1, high: 2, low: 0, close: 1, volume: '123' }])[0].volume, 123);
  assert.throws(() => parseCandles([{ datetime: '2024-01-02', open: 1, high: 2, low: 0, close: 1, volume: '-1' }]), /invalid volume/);
});

test('does not invent a structure when there are insufficient candles', () => {
  const result = calculateStructure([{ time: 1, open: 1, high: 2, low: 0, close: 1 }]);
  assert.equal(result.bos, null);
  assert.equal(result.fib, null);
  assert.equal(rangeStatus(result, 1), 'Unavailable');
});

test('higher-timeframe ranges follow directional candle breaks and extend the active extreme', () => {
  const candles = [
    { open: 5, high: 6, low: 4, close: 5 },
    { open: 6, high: 8, low: 5, close: 7 },
    { open: 5, high: 6, low: 3, close: 4 },
    { open: 5, high: 7, low: 4, close: 6 },
    { open: 7, high: 10, low: 6, close: 9 },
    { open: 9, high: 12, low: 8, close: 10 },
  ];
  assert.deepEqual(calculateHigherTimeframeRange(candles, 1, 30), { high: 12, low: 3, mid: 7.5 });
  assert.equal(higherTimeframeStatus(calculateHigherTimeframeRange(candles, 1, 30), 7), 'Discount');
  assert.equal(higherTimeframeStatus(calculateHigherTimeframeRange(candles, 1, 30), 8), 'Premium');
  const bearishClose = [...candles.slice(0, 4), { open: 10, high: 11, low: 7, close: 9 }];
  assert.equal(calculateHigherTimeframeRange(bearishClose, 1, 30), null);
});

test('profile uses whole-bar fallback for gaps inside lower-timeframe coverage', () => {
  const leg = [{ time: 0, high: 10, low: 0, volume: 100 }, { time: 300, high: 10, low: 0, volume: 200 }];
  const minute = [0, 60, 120, 180, 240, 300, 360, 480, 540].map(time => ({ time, volume: 1 }));
  const selected = profileCandles(leg, minute, 300, 600);
  assert.equal(selected.fallback, 1);
  assert.equal(selected.candles.length, 6);
  assert.equal(selected.candles[5], leg[1]);
});

test('fib extreme matches Pine tie handling for the profile end bar', () => {
  const bars = [{ high: 10, low: 0 }, { high: 10, low: 0 }, { high: 9, low: 1 }];
  assert.equal(findFibExtreme(bars, 0, 'bull'), 0);
  assert.equal(findFibExtreme(bars, 0, 'bear'), 0);
  assert.equal(findFibExtreme([...bars, bars[0]], 0, 'bull'), 3);
});
