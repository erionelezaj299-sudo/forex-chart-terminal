import { calculateStructure, parseCandles, rangeStatus } from './indicator.js';

const currencies = { AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', NZD: 'New Zealand Dollar', USD: 'US Dollar', XAU: 'Gold' };
const symbols = ['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','AUDCAD','AUDCHF','AUDJPY','AUDNZD','CADCHF','CADJPY','CHFJPY','NZDCAD','NZDCHF','NZDJPY','XAUUSD'];
const intervals = [['1m','1min','1 minute'],['5m','5min','5 minutes'],['15m','15min','15 minutes'],['30m','30min','30 minutes'],['1H','1h','1 hour'],['4H','4h','4 hours'],['1D','1day','1 day']];
const $ = id => document.getElementById(id);
let interval = '4h', data = [], structure = null, controller, chart, series;
const select = $('symbol');
for (const symbol of symbols) select.add(new Option(symbol, symbol));
for (const [label, value] of intervals) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.interval = value;
  button.classList.toggle('active', value === interval);
  button.addEventListener('click', () => { interval = value; document.querySelectorAll('#timeframes button').forEach(b => b.classList.toggle('active', b === button)); load(); });
  $('timeframes').append(button);
}
for (const label of ['HTF Alignment','Liquidity Sweep','BOS + Imbalance','71% Retracement']) {
  const row = document.createElement('label');
  const input = document.createElement('input'); input.type = 'checkbox';
  input.addEventListener('change', () => { $('score').textContent = String(document.querySelectorAll('#checklist input:checked').length * 25); });
  row.append(input, document.createTextNode(label));
  const points = document.createElement('span'); points.textContent = '+25'; row.append(points); $('checklist').append(row);
}
function setStatus(text, state = '') { $('data-status').className = `data-status ${state}`; $('data-status').innerHTML = '<i></i>'; $('data-status').append(document.createTextNode(text)); }
function message(title, text, button = false) {
  $('chart-message').hidden = false;
  $('chart-message').querySelector('strong').textContent = title;
  $('chart-message').querySelector(':scope > span').textContent = text;
  $('connect-button').hidden = !button;
}
function symbolText() {
  const symbol = select.value, base = symbol.slice(0, 3), quote = symbol.slice(3);
  $('pair-title').textContent = symbol;
  $('pair-description').textContent = `${currencies[base]} / ${currencies[quote]} · ${intervals.find(x => x[1] === interval)[2]}`;
  document.querySelector('.pair-tag').textContent = base === 'XAU' ? 'METAL' : 'FOREX';
}
function initChart() {
  if (!window.LightweightCharts) { message('Chart library unavailable', 'Check your connection and reload the page.'); return false; }
  chart = LightweightCharts.createChart($('chart'), {
    layout: { background: { color: '#ffffff' }, textColor: '#a0a79d', fontFamily: 'DM Sans, sans-serif', fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.12 } },
    timeScale: { borderVisible: false, timeVisible: true, rightOffset: 20 },
    crosshair: { vertLine: { color: '#d3d7d0', labelBackgroundColor: '#343a35' }, horzLine: { color: '#d3d7d0', labelBackgroundColor: '#343a35' } },
  });
  series = chart.addCandlestickSeries({ upColor: '#d7b74b', downColor: '#4a4a4a', borderUpColor: '#d7b74b', borderDownColor: '#4a4a4a', wickUpColor: '#9e9a80', wickDownColor: '#777777' });
  new ResizeObserver(() => { chart.applyOptions({ width: $('chart').clientWidth, height: $('chart').clientHeight }); draw(); }).observe($('chart'));
  chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
  return true;
}
function draw() {
  if (!chart || !series) return;
  const canvas = $('overlays'), rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  if (!structure || !data.length) return;
  const x = n => chart.timeScale().logicalToCoordinate(n), y = p => series.priceToCoordinate(p);
  const line = (start, end, price, color, text, dash = []) => {
    const x1 = x(start), x2 = x(end), py = y(price);
    if (x1 === null || x2 === null || py === null) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1, py); ctx.lineTo(x2, py); ctx.stroke(); ctx.setLineDash([]);
    if (text) { ctx.font = '10px DM Sans'; ctx.fillStyle = color; ctx.fillText(text, Math.min(x2 + 4, rect.width - 35), py - 4); }
  };
  for (const gap of structure.gaps) {
    const left = x(gap.start), right = x(gap.end), top = y(gap.top), bottom = y(gap.bottom);
    if ([left, right, top, bottom].some(v => v === null)) continue;
    ctx.fillStyle = 'rgba(120,123,134,.16)'; ctx.fillRect(left, top, right - left, bottom - top);
  }
  if (structure.fib) {
    const f = structure.fib, end = data.length - 1 + 13;
    line(f.start, end, f.zero, '#858b82', '0.0');
    line(f.start, end, f.one, '#858b82', '1.0');
    line(f.start, end, f.level, '#d7b74b', '0.71');
  }
  if (structure.bos) line(structure.bos.start, structure.bos.end, structure.bos.price, '#434843', 'BOS');
  if (structure.liquidity) line(structure.liquidity.start, structure.liquidity.end, structure.liquidity.price, '#434843', 'LQ');
  ctx.font = '9px DM Sans'; ctx.fillStyle = '#60675f';
  for (const label of structure.labels) {
    const px = x(label.index), py = y(label.price);
    if (px !== null && py !== null && px >= 0 && px <= rect.width) ctx.fillText(label.text, px - 6, py + (label.high ? -8 : 13));
  }
  for (const fractal of structure.fractals) {
    const px = x(fractal.index), py = y(fractal.price);
    if (px === null || py === null) continue;
    const offset = fractal.high ? -8 : 8, tip = fractal.high ? 3 : -3;
    ctx.beginPath(); ctx.moveTo(px - 3, py + offset); ctx.lineTo(px + 3, py + offset); ctx.lineTo(px, py + offset + tip); ctx.closePath(); ctx.fill();
  }
}
async function fetchCandles(symbol, timeframe, key, signal) {
  const params = new URLSearchParams({ symbol: `${symbol.slice(0,3)}/${symbol.slice(3)}`, interval: timeframe, outputsize: '500', timezone: 'UTC', apikey: key });
  const response = await fetch(`https://api.twelvedata.com/time_series?${params}`, { signal });
  if (!response.ok) throw new Error(`Twelve Data returned HTTP ${response.status}.`);
  const json = await response.json();
  if (json.status === 'error' || json.code) throw new Error(json.message || 'Twelve Data rejected the request.');
  return parseCandles(json.values);
}
async function load() {
  symbolText();
  if (!chart) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal, symbol = select.value, key = localStorage.getItem('pivot-api-key');
  series.setData([]); data = []; structure = null; draw();
  $('last-price').textContent = '—'; $('price-change').textContent = '—'; $('structure').textContent = '—'; $('fib-value').textContent = '—'; $('pd-4h').textContent = '—'; $('pd-1d').textContent = '—';
  if (!key) { setStatus('Not connected'); message('Your chart is ready', 'Connect your market data to start exploring.', true); return; }
  setStatus('Loading'); message('Loading market data', 'Fetching candles from Twelve Data…');
  try {
    const result = await fetchCandles(symbol, interval, key, signal);
    if (signal.aborted) return;
    data = result; structure = calculateStructure(data);
    const digits = symbol.endsWith('JPY') || symbol.startsWith('XAU') ? 3 : 5;
    series.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits } });
    series.setData(data);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 120), to: data.length + 20 });
    const last = data[data.length - 1], prev = data[data.length - 2];
    $('last-price').textContent = last.close.toFixed(digits);
    $('price-change').textContent = prev ? `${last.close >= prev.close ? '+' : ''}${((last.close / prev.close - 1) * 100).toFixed(2)}% vs previous candle` : 'Latest available candle';
    $('structure').textContent = structure.bos ? `${structure.bos.direction === 'bull' ? 'Bullish' : 'Bearish'} BOS` : 'Not found';
    $('fib-value').textContent = structure.fib ? structure.fib.level.toFixed(digits) : 'Unavailable';
    $('chart-message').hidden = true; setStatus('Data loaded', 'connected');
    requestAnimationFrame(() => requestAnimationFrame(draw));
    const higher = ['4h', '1day'];
    const outcomes = await Promise.allSettled(higher.map(tf => tf === interval ? Promise.resolve(result) : fetchCandles(symbol, tf, key, signal)));
    if (signal.aborted) return;
    outcomes.forEach((outcome, i) => {
      const element = $(i === 0 ? 'pd-4h' : 'pd-1d');
      if (outcome.status === 'fulfilled') element.textContent = rangeStatus(calculateStructure(outcome.value), last.close);
      else { element.textContent = 'Unavailable'; element.title = outcome.reason.message; setStatus('Some data unavailable', 'error'); }
    });
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus('Data unavailable', 'error'); message('Unable to load market data', error.message, true);
  }
}
$('settings-button').addEventListener('click', () => $('settings').showModal());
$('connect-button').addEventListener('click', () => $('settings').showModal());
$('close-settings').addEventListener('click', () => $('settings').close());
$('settings-form').addEventListener('submit', event => { event.preventDefault(); localStorage.setItem('pivot-api-key', $('api-key').value.trim()); $('api-key').value = ''; $('settings').close(); load(); });
$('remove-key').addEventListener('click', () => { localStorage.removeItem('pivot-api-key'); $('api-key').value = ''; $('settings').close(); load(); });
$('refresh').addEventListener('click', load);
select.addEventListener('change', load);
symbolText();
if (initChart()) load();
