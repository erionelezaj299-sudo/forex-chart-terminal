import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawStructureLine } from '../src/overlays.js';

test('BOS and liquidity labels are centered above equally wide lines', () => {
  const calls = [];
  const ctx = {
    setLineDash: () => {}, beginPath: () => {}, stroke: () => {},
    moveTo: (x, y) => calls.push(['start', x, y]),
    lineTo: (x, y) => calls.push(['end', x, y]),
    measureText: () => ({ width: 18 }),
    fillText: (text, x, y) => calls.push([text, x, y]),
  };
  for (const label of ['BOS', 'LQ']) {
    drawStructureLine(ctx, 10, 90, 50, { label, color: '#000000', width: 2 });
    assert.equal(ctx.lineWidth, 2);
    assert.deepEqual(calls.splice(0), [['start', 10, 50], ['end', 90, 50], [label, 41, 46]]);
  }
});
