import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPosition } from '../src/drawings.js';

test('long and short drawings require correctly placed stop and target', () => {
  const points = prices => prices.map(price => ({ price }));
  assert.equal(validPosition('long', points([10, 9, 12])), true);
  assert.equal(validPosition('long', points([10, 10, 12])), false);
  assert.equal(validPosition('short', points([10, 11, 8])), true);
  assert.equal(validPosition('short', points([10, 9, 8])), false);
});
