import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStructure, calculateVolumeProfile, parseCandles, rangeStatus } from '../src/indicator.js';
import { scanSetup, scannerLeg } from '../src/scanner.js';

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

test('scanner detects the incremental leg and scores only available conditions', () => {
  const prices = [5,4,3,4,5,7,6,5,4,5,6,8,9,8,7];
  const candles = prices.map((price, time) => ({ time, open: price, high: price + 0.4, low: price - 0.4, close: price + 0.2 }));
  const opts = { sensitivity: 2 };
  assert.equal(scannerLeg(candles, opts).at(-1).direction, 1);
  const result = scanSetup(candles, candles, opts);
  assert.equal(result.direction, 1);
  assert.equal(result.bos, true);
  assert.equal(result.liquidity, false);
  assert.equal(result.fvg, true);
  assert.equal(result.alignment, false);
  assert.equal(result.score, 50);
  const reversed = [...candles, { time: 15, open: 1.5, high: 2, low: 1, close: 1.5 }];
  assert.equal(scannerLeg(reversed, opts).at(-1).direction, -1);
  assert.equal(scanSetup(reversed, candles, opts).direction, -1);
  assert.equal(scanSetup(candles.slice(0, 2), candles, opts), null);
});

test('does not invent a structure when there are insufficient candles', () => {
  const result = calculateStructure([{ time: 1, open: 1, high: 2, low: 0, close: 1 }]);
  assert.equal(result.bos, null);
  assert.equal(result.fib, null);
  assert.equal(rangeStatus(result, 1), 'Unavailable');
});
