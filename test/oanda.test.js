import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchOandaCandles, fetchOandaInstruments, fetchOandaQuotes, streamOandaQuotes } from '../src/oanda.js';

const config = { environment: 'practice', account: 'test-account', token: 'test-token' };

test('OANDA candles use midpoint prices, tick counts, and authenticated requests', async () => {
  const original = globalThis.fetch;
  let url, options;
  globalThis.fetch = async (value, init) => {
    url = new URL(value); options = init;
    return { ok: true, json: async () => ({ instrument: 'EUR_USD', granularity: 'H4', candles: [
      { time: '2024-01-02T00:00:00.000000000Z', mid: { o: '1.1', h: '1.2', l: '1.0', c: '1.15' }, volume: 420 },
    ] }) };
  };
  try {
    const data = await fetchOandaCandles(config, 'EURUSD', '4h', undefined, 9000);
    assert.equal(url.origin, 'https://api-fxpractice.oanda.com');
    assert.equal(url.pathname, '/v3/instruments/EUR_USD/candles');
    assert.equal(url.searchParams.get('granularity'), 'H4');
    assert.equal(url.searchParams.get('count'), '5000');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(data[0].volume, 420);
    assert.equal(data[0].close, 1.15);
  } finally { globalThis.fetch = original; }
});

test('OANDA account instruments and prices preserve availability and stale state', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, json: async () => url.includes('/instruments') ? {
    instruments: [{ name: 'EUR_USD' }, { name: 'XAU_USD' }],
  } : { prices: [
    { instrument: 'EUR_USD', bids: [{ price: '1.1' }], asks: [{ price: '1.2' }], status: 'tradeable', time: '2024-01-01T00:00:00Z' },
    { instrument: 'XAU_USD', bids: [{ price: '2000' }], asks: [{ price: '2001' }], status: 'non-tradeable', time: '2024-01-01T00:00:00Z' },
  ] } });
  try {
    assert.deepEqual([...await fetchOandaInstruments(config)], ['EURUSD', 'XAUUSD']);
    const quotes = await fetchOandaQuotes(config, ['EURUSD', 'XAUUSD'], undefined);
    assert.equal(quotes.EURUSD.price, 1.15);
    assert.equal(quotes.EURUSD.stale, false);
    assert.equal(quotes.XAUUSD.stale, true);
  } finally { globalThis.fetch = original; }
});

test('OANDA authentication failures are explicit and never include the token', async () => {
  await assert.rejects(fetchOandaQuotes(null, [], undefined), /account ID and API token/);
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(fetchOandaInstruments(config), error => /401/.test(error.message) && !error.message.includes(config.token));
  } finally { globalThis.fetch = original; }
});

test('OANDA stream parses split messages and reports an unexpected end', async () => {
  const original = globalThis.fetch, encoder = new TextEncoder(), received = [];
  let url, options, opened = false;
  const lines = [
    '{"type":"HEARTBEAT","time":"2024-01-01T00:00:00Z"}\n{"type":"PRICE","instrument":"EUR_',
    'USD","bids":[{"price":"1.1"}],"asks":[{"price":"1.2"}],"status":"tradeable","time":"2024-01-01T00:00:00Z"}\n',
  ];
  globalThis.fetch = async (value, init) => {
    url = new URL(value); options = init;
    return { ok: true, body: new ReadableStream({ start(controller) { for (const line of lines) controller.enqueue(encoder.encode(line)); controller.close(); } }) };
  };
  try {
    await assert.rejects(streamOandaQuotes(config, ['EURUSD'], new AbortController().signal, () => { opened = true; }, quote => received.push(quote)), /stream ended/);
    assert.equal(url.origin, 'https://stream-fxpractice.oanda.com');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(opened, true);
    assert.equal(received[0].symbol, 'EURUSD');
    assert.equal(received[0].price, 1.15);
  } finally { globalThis.fetch = original; }
});
