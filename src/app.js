import { calculateStructure, calculateVolumeProfile, calculateHigherTimeframeRange, higherTimeframeStatus, profileCandles, DEFAULT_SETTINGS } from './indicator.js?v=20261123b';
import { fetchCandles, fetchWatchlistQuotes } from './market-data.js';
import { parseLiveTick, updateCurrentCandle } from './live-data.js';
import { drawStructureLine } from './overlays.js';
import { GROUPS } from './settings.js';

const currencies = { AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', NZD: 'New Zealand Dollar', USD: 'US Dollar', XAU: 'Gold' };
const symbols = ['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','AUDCAD','AUDCHF','AUDJPY','AUDNZD','CADCHF','CADJPY','CHFJPY','NZDCAD','NZDCHF','NZDJPY','XAUUSD'];
const intervals = [['1m','1min','1 minute'],['5m','5min','5 minutes'],['15m','15min','15 minutes'],['30m','30min','30 minutes'],['1H','1h','1 hour'],['4H','4h','4 hours'],['1D','1day','1 day']];
const $ = id => document.getElementById(id);
let interval = '4h', data = [], structure = null, controller, chart, series, profile = null;
let watchlistController, watchlistQuotes = {};
let htfCandles = [null, null], latestTick = null, stream, streamState = 'connecting', refreshRunning = false;
const intervalSeconds = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400 };
let provider = localStorage.getItem('pivot-data-provider') === 'twelvedata' ? 'twelvedata' : 'biquote';
let options = { ...DEFAULT_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem('pivot-indicator-settings') || '{}');
  for (const [, fields] of GROUPS) for (const [, key, type, min, max] of fields) {
    const value = saved[key];
    if (type === 'checkbox' && typeof value === 'boolean') options[key] = value;
    else if (type === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) options[key] = value;
    else if (type === 'choice' && min.includes(String(value))) options[key] = value;
    else if (type === 'color' && typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) options[key] = value;
    else if (type === 'text' && typeof value === 'string') options[key] = value;
  }
} catch (error) {
  console.error('Unable to read indicator settings:', error);
  $('data-details').textContent = 'Saved indicator settings could not be read; defaults are in use.';
}
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
  $('fib-label').textContent = `Fib ${options.fibRatio}`;
  $('pair-description').textContent = `${currencies[base]} / ${currencies[quote]} · ${intervals.find(x => x[1] === interval)[2]} · ${provider === 'biquote' ? 'biquote' : 'Twelve Data'}`;
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
  series = chart.addCandlestickSeries({ upColor: '#d7b74b', downColor: '#4a4a4a', borderUpColor: '#000000', borderDownColor: '#000000', wickUpColor: '#9e9a80', wickDownColor: '#777777' });
  new ResizeObserver(() => { chart.applyOptions({ width: $('chart').clientWidth, height: $('chart').clientHeight }); draw(); }).observe($('chart'));
  chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
  $('chart').addEventListener('pointermove', event => { if (event.buttons) requestAnimationFrame(draw); });
  $('chart').addEventListener('wheel', () => requestAnimationFrame(draw), { passive: true });
  return true;
}
function draw() {
  if (!chart || !series) return;
  const canvas = $('overlays'), rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  if (!structure || !data.length) return;
  const x = n => chart.timeScale().logicalToCoordinate(n), y = p => series.priceToCoordinate(p);
  const line = (start, end, price, color, text, dash = [], width = 1) => {
    const x1 = x(start), x2 = x(end), py = y(price);
    if (x1 === null || x2 === null || py === null) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x1, py); ctx.lineTo(x2, py); ctx.stroke(); ctx.setLineDash([]);
    if (text) { ctx.font = '10px DM Sans'; ctx.fillStyle = color; ctx.fillText(text, Math.min(x2 + 4, rect.width - 35), py - 4); }
  };
  for (const gap of options.showFvg ? structure.gaps : []) {
    const left = x(gap.start), right = x(gap.end), top = y(gap.top), bottom = y(gap.bottom);
    if ([left, right, top, bottom].some(v => v === null)) continue;
    ctx.fillStyle = `${options.fvgColor}33`; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = `${options.fvgBorder}42`; ctx.lineWidth = 1; ctx.strokeRect(left, top, right - left, bottom - top);
  }
  if (structure.fib && options.showFib) {
    const f = structure.fib, end = data.length - 1 + options.fibExtension;
    const label = text => options.showFibPrice ? text : '';
    if (options.showFib0) line(f.start, end, f.zero, options.fibColor, label('0.0'), [], options.fibWidth);
    if (options.showFib1) line(f.start, end, f.one, options.fibColor, label('1.0'), [], options.fibWidth);
    line(f.start, end, f.level, options.fibMainColor, label(String(options.fibRatio)), [], options.fibWidth);
    for (let i = 2; i <= 5; i++) if (options[`fib${i}Enabled`]) {
      const ratioValue = options[`fib${i}`];
      line(f.start, end, f.zero + ratioValue * (f.one - f.zero), options[`fib${i}Color`], label(String(ratioValue)), [], options.fibWidth);
    }
    if (options.showFib618) line(f.start, end, f.zero + 0.618 * (f.one - f.zero), options.fibColor, label('0.618'), [], options.fibWidth);
    if (options.showFib236) line(f.start, end, f.zero + 0.236 * (f.one - f.zero), options.fibColor, label('0.236'), [], options.fibWidth);
  }
  if (options.showVp && profile && !profile.error && structure.fib) {
    const right = x(data.length - 1 + options.vpOffset), width = Math.abs((x(data.length + options.vpOffset) ?? 0) - (right ?? 0));
    if (right !== null && width > 0) {
      profile.bins.forEach((v, i) => {
        const top = y(profile.bottom + (i + 1) * profile.rowHeight), bottom = y(profile.bottom + i * profile.rowHeight);
        if (top === null || bottom === null) return;
        const w = Math.round(v / profile.max * options.vpWidth) * width;
        ctx.fillStyle = i === profile.pocIndex ? `${options.vpPocColor}a6` : `${options.vpColor}38`;
        ctx.fillRect(right - w, top, w, Math.max(1, bottom - top));
      });
      if (options.vpPoc) line(structure.fib.start, data.length - 1 + options.vpOffset, profile.pocPrice, options.vpPocLineColor, 'POC', options.vpPocLineStyle === 'solid' ? [] : options.vpPocLineStyle === 'dotted' ? [1, 3] : [4, 3], options.vpPocLineWidth);
    }
  }
  if (options.showBos && structure.bos) drawStructureLine(ctx, x(structure.bos.start), x(structure.bos.end), y(structure.bos.price), { label: 'BOS', color: options.bosColor, width: options.bosWidth });
  if (options.showLiquidity && structure.liquidity) drawStructureLine(ctx, x(structure.liquidity.start), x(structure.liquidity.end), y(structure.liquidity.price), { label: 'LQ', color: '#434843', width: options.bosWidth });
  ctx.font = '9px DM Sans'; ctx.fillStyle = '#60675f';
  for (const label of options.showStructure ? structure.labels : []) {
    const px = x(label.index), py = y(label.price);
    if (px !== null && py !== null && px >= 0 && px <= rect.width) ctx.fillText(label.text, px - 6, py + (label.high ? -8 : 13));
  }
  for (const fractal of options.showFractals && options.showStructure ? structure.fractals : []) {
    const px = x(fractal.index), py = y(fractal.price);
    if (px === null || py === null) continue;
    const offset = fractal.high ? -8 : 8, tip = fractal.high ? 3 : -3;
    ctx.beginPath(); ctx.moveTo(px - 3, py + offset); ctx.lineTo(px + 3, py + offset); ctx.lineTo(px, py + offset + tip); ctx.closePath(); ctx.fill();
  }
}
async function load({ background = false } = {}) {
  symbolText();
  renderWatchlist();
  if (!chart) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal, symbol = select.value, key = localStorage.getItem('pivot-api-key'), source = provider;
  $('source-name').textContent = source === 'biquote' ? 'BIQUOTE' : 'TWELVE DATA';
  if (!background) {
    series.setData([]); data = []; structure = null; profile = null; htfCandles = [null, null]; latestTick = null; draw();
    $('last-price').textContent = '—'; $('price-change').textContent = '—'; $('structure').textContent = '—'; $('fib-value').textContent = '—'; $('pd-4h').textContent = '—'; $('pd-1d').textContent = '—'; $('vp-status').textContent = '—'; $('data-details').textContent = '';
  }
  if (source === 'twelvedata' && !key) { setStatus('Not connected'); message('Your chart is ready', 'Connect your Twelve Data API key to start exploring.', true); return; }
  if (!background) { setStatus('Loading'); message('Loading market data', `Fetching candles from ${source === 'biquote' ? 'biquote' : 'Twelve Data'}…`); }
  try {
    const result = await fetchCandles(source, symbol, interval, key, signal);
    if (signal.aborted) return;
    data = result; structure = calculateStructure(data, options);
    const digits = symbol.endsWith('JPY') || symbol.startsWith('XAU') ? 3 : 5;
    series.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits } });
    series.setData(data);
    if (!background) {
      chart.priceScale('right').applyOptions({ autoScale: true });
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 120), to: data.length + 20 });
    }
    const last = data[data.length - 1], prev = data[data.length - 2];
    $('last-price').textContent = last.close.toFixed(digits);
    $('price-change').textContent = prev ? `${last.close >= prev.close ? '+' : ''}${((last.close / prev.close - 1) * 100).toFixed(2)}% vs previous candle` : 'Latest available candle';
    $('structure').textContent = structure.bos ? `${structure.bos.direction === 'bull' ? 'Bullish' : 'Bearish'} BOS` : 'Not found';
    $('fib-value').textContent = structure.fib ? structure.fib.level.toFixed(digits) : 'Unavailable';
    $('chart-message').hidden = true;
    if (source === 'biquote') updateStreamStatus(); else setStatus('Snapshot · manual refresh', 'connected');
    requestAnimationFrame(() => requestAnimationFrame(draw));
    const higher = ['4h', '1day'];
    const needMinute = options.use1mPrice || (options.showVp && options.vpUseLtf && interval !== '1min');
    const outcomes = await Promise.allSettled([
      ...higher.map(tf => tf === interval ? Promise.resolve(result) : fetchCandles(source, symbol, tf, key, signal)),
      needMinute ? (interval === '1min' ? Promise.resolve(result) : fetchCandles(source, symbol, '1min', key, signal, options.showVp && options.vpUseLtf ? 5000 : 1)) : Promise.resolve(null),
    ]);
    if (signal.aborted) return;
    const minute = outcomes[2].status === 'fulfilled' ? outcomes[2].value : null;
    const price = source === 'biquote' && latestTick ? latestTick.price : options.use1mPrice && minute?.length ? minute[minute.length - 1].close : last.close;
    const details = [];
    if (options.use1mPrice && !minute) details.push(`1m price unavailable; using chart close${outcomes[2].reason ? ` (${outcomes[2].reason.message})` : ''}.`);
    outcomes.slice(0, 2).forEach((outcome, i) => {
      const element = $(i === 0 ? 'pd-4h' : 'pd-1d');
      if (!options.premiumEnabled) { element.textContent = 'Disabled'; return; }
      if (outcome.status === 'fulfilled') {
        htfCandles[i] = outcome.value.map(c => ({ ...c }));
        const range = calculateHigherTimeframeRange(htfCandles[i], i === 0 ? Math.max(2, options.sensitivity4h - 1) : options.sensitivity1d, options.closeThreshold);
        element.textContent = higherTimeframeStatus(range, price);
        element.title = range ? `Midpoint ${range.mid.toFixed(digits)} · ${source} ${i === 0 ? '4H' : '1D'} candles` : 'No confirmed higher-timeframe BOS in available history.';
      } else {
        htfCandles[i] = null;
        element.textContent = 'Unavailable'; element.title = outcome.reason.message;
        details.push(`${i === 0 ? '4H' : '1D'}: ${outcome.reason.message}`); setStatus('Some data unavailable', 'error');
      }
    });
    if (options.showVp && structure.fib) {
      const end = options.vpEndAtExtreme ? structure.fib.extremeIndex : data.length - 1;
      const leg = data.slice(structure.fib.start, end + 1);
      const selected = options.vpUseLtf && interval !== '1min' && minute ? profileCandles(leg, minute, intervalSeconds[interval]) : { candles: leg, fallback: options.vpUseLtf && interval !== '1min' ? leg.length : 0 };
      const volumeCandles = selected.candles;
      profile = calculateVolumeProfile(volumeCandles, structure.fib, options);
      if (source === 'biquote') details.push('Profile uses biquote tick counts, not traded volume.');
      if (selected.fallback) details.push(`Incomplete 1m coverage for ${selected.fallback} chart bar(s); chart-bar volume is used, so POC is approximate.`);
      if (!minute && options.vpUseLtf && interval !== '1min') details.push(`1m intrabars unavailable; chart-bar volume is used when available${outcomes[2].status === 'rejected' ? ` (${outcomes[2].reason.message})` : ''}.`);
      $('vp-status').textContent = profile.error ? 'Unavailable' : selected.fallback || source === 'biquote' ? 'Approximate' : 'Available';
      if (profile.error) details.push(`Volume profile: ${profile.error}`);
    } else $('vp-status').textContent = options.showVp ? 'No active leg' : 'Disabled';
    $('data-details').textContent = details.join(' ');
    if (source === 'biquote' && latestTick) applyTick(latestTick);
    draw();
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (background) { setStatus('Candle refresh failed', 'error'); $('data-details').textContent = `Candle refresh failed: ${error.message}`; }
    else { setStatus('Data unavailable', 'error'); message('Unable to load market data', error.message, true); }
  }
}
function updateProviderFields() {
  const wantsKey = $('data-provider').value === 'twelvedata';
  $('key-fields').hidden = !wantsKey;
  $('api-key').required = wantsKey && !localStorage.getItem('pivot-api-key');
  $('api-key').placeholder = localStorage.getItem('pivot-api-key') ? 'Leave blank to keep saved key' : 'Enter your API key';
}
function updateStreamStatus() {
  if (provider !== 'biquote') return;
  if (streamState === 'connected' && latestTick && Date.now() / 1000 - latestTick.time <= 30) setStatus('Live · biquote', 'connected');
  else if (streamState === 'connected') setStatus('Stream connected · awaiting fresh quote');
  else setStatus(streamState === 'connecting' ? 'Connecting live feed' : 'Live feed unavailable', streamState === 'connecting' ? '' : 'error');
}
function applyTick(tick) {
  if (provider !== 'biquote' || tick.symbol !== select.value || Date.now() / 1000 - tick.time > 30) return;
  const updated = updateCurrentCandle(data, tick, intervalSeconds[interval]);
  if (!updated) return;
  if (updated.time === data[data.length - 1].time) data[data.length - 1] = updated;
  else data.push(updated);
  series.update(updated);
  const digits = tick.symbol.endsWith('JPY') || tick.symbol.startsWith('XAU') ? 3 : 5;
  $('last-price').textContent = tick.price.toFixed(digits);
  const prev = data[data.length - 2];
  if (prev) $('price-change').textContent = `${tick.price >= prev.close ? '+' : ''}${((tick.price / prev.close - 1) * 100).toFixed(2)}% vs previous candle`;
  for (let i = 0; i < 2; i++) {
    if (!htfCandles[i] || !options.premiumEnabled) continue;
    const candles = htfCandles[i], bar = updateCurrentCandle(candles, tick, i === 0 ? 14400 : 86400);
    if (!bar) continue;
    if (bar.time === candles[candles.length - 1].time) candles[candles.length - 1] = bar; else candles.push(bar);
    const range = calculateHigherTimeframeRange(candles, i === 0 ? Math.max(2, options.sensitivity4h - 1) : options.sensitivity1d, options.closeThreshold);
    const element = $(i === 0 ? 'pd-4h' : 'pd-1d');
    element.textContent = higherTimeframeStatus(range, tick.price);
    element.title = range ? `Midpoint ${range.mid.toFixed(digits)} · biquote ${i === 0 ? '4H' : '1D'} candles` : 'No confirmed higher-timeframe BOS in available history.';
  }
  updateStreamStatus();
}
let watchlistFrame = 0;
function startStream() {
  if (stream || provider !== 'biquote') return;
  if (!window.signalR) { streamState = 'unavailable'; updateStreamStatus(); return; }
  const connection = new signalR.HubConnectionBuilder().withUrl('https://biquote.io/hubs/tick', { withCredentials: false }).withAutomaticReconnect().build();
  stream = connection; streamState = 'connecting'; updateStreamStatus();
  connection.on('ReceiveTick', raw => {
    if (stream !== connection || provider !== 'biquote') return;
    const tick = parseLiveTick(raw);
    if (!tick || !symbols.includes(tick.symbol) || Date.now() / 1000 - tick.time > 30) return;
    if (watchlistQuotes[tick.symbol]?.time > tick.time) return;
    watchlistQuotes[tick.symbol] = { price: tick.price, stale: false, time: tick.time };
    if (!watchlistFrame) watchlistFrame = requestAnimationFrame(() => {
      watchlistFrame = 0;
      document.querySelectorAll('.watchlist-row').forEach(row => setWatchlistPrice(row, row.dataset.symbol));
    });
    if (tick.symbol === select.value && (!latestTick || tick.time >= latestTick.time)) { latestTick = tick; applyTick(tick); }
  });
  connection.onreconnecting(() => { streamState = 'unavailable'; updateStreamStatus(); });
  connection.onreconnected(async () => {
    try { await connection.invoke('Subscribe', symbols); streamState = 'connected'; latestTick = null; updateStreamStatus(); }
    catch (error) { streamState = 'unavailable'; updateStreamStatus(); console.error('Unable to resubscribe to the live feed:', error); }
  });
  connection.onclose(() => {
    if (stream !== connection) return;
    stream = null; streamState = 'unavailable'; updateStreamStatus();
    if (provider === 'biquote') setTimeout(startStream, 15000);
  });
  (async () => {
    try {
      await connection.start();
      if (stream !== connection || provider !== 'biquote') { await connection.stop(); return; }
      await connection.invoke('Subscribe', symbols);
      streamState = 'connected'; updateStreamStatus();
    } catch (error) {
      console.error('Unable to connect to the live feed:', error);
      if (stream === connection) { stream = null; streamState = 'unavailable'; updateStreamStatus(); setTimeout(startStream, 15000); }
      await connection.stop();
    }
  })();
}
function stopStream() {
  const previous = stream; stream = null; latestTick = null;
  if (previous) previous.stop().catch(error => console.error('Unable to disconnect the live feed:', error));
}
const terminal = document.querySelector('.terminal');
function syncFullscreenButton() {
  if (!$('fullscreen')) return;
  const active = document.fullscreenElement === terminal || terminal.classList.contains('expanded');
  $('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen chart' : 'Enter fullscreen chart');
  $('fullscreen').title = active ? 'Exit fullscreen chart' : 'Fullscreen chart';
  $('fullscreen').querySelector('span').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
}
$('fullscreen')?.addEventListener('click', async () => {
  if (terminal.classList.contains('expanded')) { terminal.classList.remove('expanded'); syncFullscreenButton(); return; }
  try {
    if (document.fullscreenElement === terminal) await document.exitFullscreen();
    else await terminal.requestFullscreen();
  } catch (error) {
    console.info('Native fullscreen unavailable; expanding within the page:', error);
    terminal.scrollLeft = 0; terminal.classList.add('expanded'); syncFullscreenButton();
  }
});
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && terminal.classList.contains('expanded')) { terminal.classList.remove('expanded'); syncFullscreenButton(); } });
function openDataSettings() { $('data-provider').value = provider; updateProviderFields(); $('settings').showModal(); }
$('data-provider').addEventListener('change', updateProviderFields);
$('settings-button').addEventListener('click', openDataSettings);
$('connect-button').addEventListener('click', openDataSettings);
$('close-settings').addEventListener('click', () => $('settings').close());
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const newKey = $('api-key').value.trim();
  const sourceChanged = provider !== $('data-provider').value;
  if (newKey && $('data-provider').value === 'twelvedata') localStorage.setItem('pivot-api-key', newKey);
  provider = $('data-provider').value;
  localStorage.setItem('pivot-data-provider', provider);
  $('api-key').value = ''; $('settings').close();
  if (sourceChanged) { stopStream(); if (provider === 'biquote') startStream(); }
  if (sourceChanged || (newKey && provider === 'twelvedata')) resetWatchlist();
  load();
});
$('remove-key').addEventListener('click', () => { localStorage.removeItem('pivot-api-key'); $('api-key').value = ''; $('settings').close(); if (provider === 'twelvedata') resetWatchlist(); load(); });
$('refresh').addEventListener('click', load);
select.addEventListener('change', load);
function renderSettings(values = options) {
  const root = $('indicator-fields'); root.replaceChildren();
  for (const [group, fields] of GROUPS) {
    const fieldset = document.createElement('fieldset'), legend = document.createElement('legend'), grid = document.createElement('div');
    legend.textContent = group; grid.className = 'settings-grid'; fieldset.append(legend, grid);
    for (const [labelText, key, type, min, max, step] of fields) {
      const wrapper = document.createElement('div'), label = document.createElement('label');
      wrapper.className = `setting${type === 'text' ? ' wide' : ''}`; label.htmlFor = `setting-${key}`; label.textContent = labelText;
      const input = document.createElement(type === 'choice' ? 'select' : 'input');
      input.id = `setting-${key}`; input.name = key;
      if (type === 'choice') {
        for (const choice of min) input.add(new Option(choice, choice));
        input.value = String(values[key]);
      } else {
        input.type = type;
        if (type === 'checkbox') input.checked = values[key];
        else input.value = values[key];
        if (type === 'number') { input.min = min; input.max = max; input.step = step; input.required = true; }
        if (type === 'text') input.required = true;
      }
      wrapper.append(label, input); grid.append(wrapper);
    }
    root.append(fieldset);
  }
}
$('indicator-settings-button').addEventListener('click', () => { renderSettings(); $('indicator-settings').showModal(); });
$('close-indicator-settings').addEventListener('click', () => $('indicator-settings').close());
$('reset-indicator').addEventListener('click', () => renderSettings(DEFAULT_SETTINGS));
$('indicator-form').addEventListener('submit', event => {
  event.preventDefault();
  const next = { ...options };
  for (const [, fields] of GROUPS) for (const [, key, type] of fields) {
    const input = document.getElementById(`setting-${key}`);
    next[key] = type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value;
  }
  options = next; localStorage.setItem('pivot-indicator-settings', JSON.stringify(options));
  $('indicator-settings').close(); load();
});
function setWatchlistPrice(row, symbol) {
  const quote = watchlistQuotes[symbol], price = row.querySelector('.watchlist-price');
  const stale = quote && (quote.stale || (quote.time && Date.now() / 1000 - quote.time > 300));
  price.textContent = quote ? `${quote.price.toFixed(symbol.endsWith('JPY') || symbol.startsWith('XAU') ? 3 : 5)}${stale ? '*' : ''}` : '—';
  row.setAttribute('aria-label', `${symbol}, ${quote ? price.textContent : 'quote unavailable'}`);
}
function renderWatchlist() {
  const list = $('watchlist'), scroll = list.scrollTop, filter = $('watchlist-filter').value.trim().toUpperCase();
  list.replaceChildren();
  for (const symbol of symbols.filter(value => value.includes(filter))) {
    const row = document.createElement('button'), name = document.createElement('span'), price = document.createElement('span');
    row.type = 'button'; row.className = 'watchlist-row'; row.dataset.symbol = symbol;
    row.classList.toggle('active', symbol === select.value);
    if (symbol === select.value) row.setAttribute('aria-current', 'true');
    name.textContent = symbol;
    price.className = 'watchlist-price';
    row.addEventListener('click', () => { select.value = symbol; load(); });
    row.append(name, price); setWatchlistPrice(row, symbol); list.append(row);
  }
  if (!list.childElementCount) {
    const empty = document.createElement('div'); empty.className = 'watchlist-empty'; empty.textContent = 'No matching pairs.'; list.append(empty);
  }
  list.scrollTop = scroll;
}
async function refreshWatchlist() {
  if (watchlistController) watchlistController.abort();
  const request = new AbortController(); watchlistController = request;
  const source = provider, key = localStorage.getItem('pivot-api-key');
  watchlistQuotes = {}; renderWatchlist();
  $('watchlist-refresh').disabled = true;
  $('watchlist-status').textContent = 'Loading quotes…';
  try {
    const result = await fetchWatchlistQuotes(source, symbols, key, request.signal);
    if (request.signal.aborted) return;
    watchlistQuotes = result;
    const count = Object.keys(result).length;
    $('watchlist-status').textContent = source === 'biquote'
      ? `biquote · ${count}/${symbols.length} available · updates on live ticks; * last known.`
      : `Twelve Data snapshot · ${count}/${symbols.length} available. Refresh for updates.`;
    renderWatchlist();
  } catch (error) {
    if (error.name !== 'AbortError') $('watchlist-status').textContent = `Quotes unavailable: ${error.message}`;
  } finally {
    if (watchlistController === request) $('watchlist-refresh').disabled = false;
  }
}
function resetWatchlist() {
  if (watchlistController) watchlistController.abort();
  watchlistController = null; $('watchlist-refresh').disabled = false;
  watchlistQuotes = {}; renderWatchlist();
  if (provider === 'biquote') refreshWatchlist();
  else $('watchlist-status').textContent = `Press refresh for Twelve Data quotes; this can use ${symbols.length} API credits.`;
}
$('watchlist-filter').addEventListener('input', renderWatchlist);
$('watchlist-refresh').addEventListener('click', refreshWatchlist);
symbolText();
resetWatchlist();
if (initChart()) { load(); startStream(); }
setInterval(updateStreamStatus, 10000);
setInterval(async () => {
  document.querySelectorAll('.watchlist-row').forEach(row => setWatchlistPrice(row, row.dataset.symbol));
  if (provider !== 'biquote' || document.hidden || !data.length || refreshRunning) return;
  refreshRunning = true;
  try { await load({ background: true }); } finally { refreshRunning = false; }
}, 60000);
