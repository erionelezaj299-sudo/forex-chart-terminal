import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrawings, validPosition } from '../src/drawings.js';

test('long and short drawings require correctly placed stop and target', () => {
  const points = prices => prices.map(price => ({ price }));
  assert.equal(validPosition('long', points([10, 9, 12])), true);
  assert.equal(validPosition('long', points([10, 10, 12])), false);
  assert.equal(validPosition('short', points([10, 11, 8])), true);
  assert.equal(validPosition('short', points([10, 9, 8])), false);
});

function harness(initial = [], replay = null) {
  class Target {
    constructor() { this.listeners = {}; this.style = {}; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
    fire(type, x = 0, y = 0) {
      const event = { type, clientX: x, clientY: y, button: 0, pointerId: 1,
        preventDefault() { this.prevented = true; }, stopPropagation() {} };
      this.dispatchEvent(event); return event;
    }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
  }
  const saved = new Map([['pivot-drawings-v1:feed:pair', JSON.stringify(initial)]]);
  globalThis.localStorage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = new Target();
  const surface = new Target(), canvas = new Target(), tool = new Target(), undo = new Target(), status = {};
  const labels = [];
  const ctx = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    fillRect() {}, strokeRect() {}, setLineDash() {}, fillText(text) { labels.push(text); } };
  canvas.parentElement = surface; canvas.classList = { toggle() {} };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
  canvas.getContext = () => ctx;
  tool.value = 'cursor';
  const bars = Array.from({ length: 20 }, (_, i) => ({ time: i * 60 }));
  const chart = { timeScale: () => ({ coordinateToLogical: x => x / 10, logicalToCoordinate: x => x * 10 }) };
  const series = { coordinateToPrice: y => (200 - y) / 10, priceToCoordinate: price => 200 - price * 10 };
  const api = createDrawings({ chart, series, canvas, tool, undo, status, getData: () => bars,
    getInterval: () => '1min', getReplayTime: () => replay });
  api.setContext('feed', 'pair');
  return { api, surface, canvas, tool, status, labels, saved: () => JSON.parse(saved.get('pivot-drawings-v1:feed:pair')),
    replay: value => { replay = value; } };
}

const long = () => ({ type: 'long', points: [{ time: 120, price: 10 }, { time: 360, price: 9 }, { time: 360, price: 12 }] });

test('positions can be selected and adjusted without accepting invalid levels', () => {
  const h = harness([long()]);
  assert.equal(h.surface.fire('pointerdown', 30, 95).prevented, true);
  h.surface.fire('pointerup', 30, 95);
  h.surface.fire('pointerdown', 40, 110);
  h.surface.fire('pointermove', 40, 90);
  h.surface.fire('pointerup', 40, 90);
  assert.equal(h.saved()[0].points[1].price, 9);
  h.surface.fire('pointerdown', 40, 110);
  h.surface.fire('pointermove', 40, 120);
  h.surface.fire('pointerup', 40, 120);
  assert.equal(h.saved()[0].points[1].price, 8);
  h.surface.fire('pointerdown', 40, 80);
  h.surface.fire('pointerup', 40, 70);
  assert.equal(h.saved()[0].points[2].price, 13);
  h.surface.fire('pointerdown', 40, 100);
  h.surface.fire('pointerup', 40, 95);
  assert.equal(h.saved()[0].points[0].price, 10.5);
  assert.ok(h.labels.some(label => label.includes('R:R')));
  assert.ok(h.labels.some(label => label.includes('Target')));
});

test('width, movement, cancellation and persistence retain legacy position format', () => {
  const h = harness([long()]);
  h.surface.fire('pointerdown', 30, 95); h.surface.fire('pointerup', 30, 95);
  h.surface.fire('pointerdown', 60, 100); h.surface.fire('pointerup', 80, 100);
  assert.equal(h.saved()[0].points[1].time, 480);
  h.surface.fire('pointerdown', 30, 95); h.surface.fire('pointerup', 40, 85);
  assert.deepEqual(h.saved()[0].points, [{ time: 180, price: 11 }, { time: 540, price: 10 }, { time: 420, price: 13 }]);
  h.surface.fire('pointerdown', 50, 90); h.surface.fire('pointermove', 50, 80);
  document.dispatchEvent({ type: 'keydown', key: 'Escape' });
  h.surface.fire('pointerup', 50, 80);
  assert.equal(h.saved()[0].points[0].price, 11);
  const reloaded = harness(h.saved());
  assert.equal(reloaded.surface.fire('pointerdown', 25, 85).prevented, true);
});

test('replay hides future positions and cursor clicks outside drawings pass through', () => {
  const h = harness([long(), { ...long(), replayCreatedAt: 180 }], 120);
  h.labels.length = 0; h.api.draw();
  assert.equal(h.labels.length, 0);
  assert.notEqual(h.surface.fire('pointerdown', 30, 95).prevented, true);
  h.replay(180); h.api.draw();
  assert.equal(h.surface.fire('pointerdown', 30, 95).prevented, true);
  h.surface.fire('pointermove', 40, 85);
  h.replay(120); h.surface.fire('pointerup', 40, 85);
  assert.equal(h.saved()[1].points[0].price, 10);
});

test('creation validates long and short and leaves other drawing tools functional', () => {
  const h = harness();
  function click(x, y) { h.canvas.fire('pointerdown', x, y); }
  h.tool.value = 'short'; h.tool.dispatchEvent(new Event('change'));
  click(20, 100); click(60, 90); click(60, 120);
  assert.equal(h.saved()[0].type, 'short');
  h.surface.fire('pointerdown', 40, 90); h.surface.fire('pointerup', 40, 80);
  assert.equal(h.saved()[0].points[1].price, 12);
  h.surface.fire('pointerdown', 60, 100); h.surface.fire('pointerup', 10, 100);
  assert.equal(h.saved()[0].points[1].time, 360);
  h.tool.value = 'trend'; h.tool.dispatchEvent(new Event('change'));
  click(20, 100); click(50, 90);
  assert.equal(h.saved()[1].type, 'trend');
});
