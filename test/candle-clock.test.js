import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candleEnd, candleCountdown } from '../src/candle-clock.js';

test('candle clock uses the selected interval and marks an expired candle', () => {
  assert.equal(candleCountdown(1000, '5min', 'biquote', 1038), 'Candle closes in 04:22');
  assert.equal(candleCountdown(1000, '5min', 'biquote', 1300), 'Candle closed · awaiting next');
});

test('OANDA daily close respects New York daylight-saving changes', () => {
  for (const [start, end] of [['2024-03-09T22:00:00Z', '2024-03-10T21:00:00Z'], ['2024-11-02T21:00:00Z', '2024-11-03T22:00:00Z']]) {
    assert.equal(candleEnd(Date.parse(start) / 1000, '1day', 'oanda'), Date.parse(end) / 1000);
  }
});
