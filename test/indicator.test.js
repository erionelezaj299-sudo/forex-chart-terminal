import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStructure, parseCandles, rangeStatus } from '../src/indicator.js';

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
  const result = calculateStructure(candles, 2);
  assert.equal(result.bos.direction, 'bull');
  assert.equal(result.bos.end, 11);
  assert.equal(result.fib.start, 8);
  assert.ok(Math.abs(result.fib.level - (9.4 + 0.71 * (3.6 - 9.4))) < 1e-10);
  assert.equal(rangeStatus(result, 9), 'Premium');
  assert.equal(rangeStatus(result, 4), 'Discount');
});

test('does not invent a structure when there are insufficient candles', () => {
  const result = calculateStructure([{ time: 1, open: 1, high: 2, low: 0, close: 1 }]);
  assert.equal(result.bos, null);
  assert.equal(result.fib, null);
  assert.equal(rangeStatus(result, 1), 'Unavailable');
});
