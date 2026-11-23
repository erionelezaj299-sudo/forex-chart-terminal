import { calculateStructure, calculateVolumeProfile, DEFAULT_SETTINGS, parseCandles, rangeStatus } from './indicator.js';
import { GROUPS } from './settings.js';
import { scanSetup } from './scanner.js';

const currencies = { AUD: 'Australian Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', NZD: 'New Zealand Dollar', USD: 'US Dollar', XAU: 'Gold' };
const symbols = ['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD','EURAUD','EURCAD','EURCHF','EURGBP','EURJPY','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPJPY','GBPNZD','AUDCAD','AUDCHF','AUDJPY','AUDNZD','CADCHF','CADJPY','CHFJPY','NZDCAD','NZDCHF','NZDJPY','XAUUSD'];
const intervals = [['1m','1min','1 minute'],['5m','5min','5 minutes'],['15m','15min','15 minutes'],['30m','30min','30 minutes'],['1H','1h','1 hour'],['4H','4h','4 hours'],['1D','1day','1 day']];
const $ = id => document.getElementById(id);
let interval = '4h', data = [], structure = null, controller, scanController, chart, series, htf = {}, profile = null;
let options = { ...DEFAULT_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem('pivot-indicator-settings') || '{}');
  for (const [, fields] of GROUPS) for (const [, key, type, min, max] of fields) {
    const value = saved[key];
    if (type === 'checkbox' && typeof value === 'boolean') options[key] = value;
    else if (type === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) options[key] = value;
    else if (type === 'choice' && min.includes(String(value))) options[key] = key === 'scannerMinScore' ? Number(value) : value;
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
  for (const [tf, enabled, color, width] of [['4h', options.show4h, options.color4h, options.width4h], ['1day', options.show1d, options.color1d, options.width1d]]) {
    const f = htf[tf]?.fib;
    if (options.premiumEnabled && enabled && f) {
      const end = Math.floor(chart.timeScale().getVisibleLogicalRange()?.to ?? data.length + 20);
      if (end <= data.length - 1) continue;
      line(data.length - 1, end, f.zero, color, `${tf} high/low`, [], width);
      line(data.length - 1, end, f.one, color, '', [], width);
      line(data.length - 1, end, (f.zero + f.one) / 2, color, `${tf} 50%`, [4, 3], width);
    }
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
  if (options.showBos && structure.bos) line(structure.bos.start, structure.bos.end, structure.bos.price, options.bosColor, 'BOS', [], options.bosWidth);
  if (options.showLiquidity && structure.liquidity) line(structure.liquidity.start, structure.liquidity.end, structure.liquidity.price, '#434843', 'LQ');
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
async function fetchCandles(symbol, timeframe, key, signal, size = 500) {
  const params = new URLSearchParams({ symbol: `${symbol.slice(0,3)}/${symbol.slice(3)}`, interval: timeframe, outputsize: String(size), timezone: 'UTC', apikey: key });
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
  series.setData([]); data = []; structure = null; htf = {}; profile = null; draw();
  $('last-price').textContent = '—'; $('price-change').textContent = '—'; $('structure').textContent = '—'; $('fib-value').textContent = '—'; $('pd-4h').textContent = '—'; $('pd-1d').textContent = '—'; $('vp-status').textContent = '—'; $('data-details').textContent = '';
  if (!key) { setStatus('Not connected'); message('Your chart is ready', 'Connect your market data to start exploring.', true); return; }
  setStatus('Loading'); message('Loading market data', 'Fetching candles from Twelve Data…');
  try {
    const result = await fetchCandles(symbol, interval, key, signal);
    if (signal.aborted) return;
    data = result; structure = calculateStructure(data, options);
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
    const needMinute = options.use1mPrice || (options.showVp && options.vpUseLtf && interval !== '1min');
    const outcomes = await Promise.allSettled([
      ...higher.map(tf => tf === interval ? Promise.resolve(result) : fetchCandles(symbol, tf, key, signal)),
      needMinute ? (interval === '1min' ? Promise.resolve(result) : fetchCandles(symbol, '1min', key, signal, options.showVp && options.vpUseLtf ? 5000 : 1)) : Promise.resolve(null),
    ]);
    if (signal.aborted) return;
    const minute = outcomes[2].status === 'fulfilled' ? outcomes[2].value : null;
    const price = options.use1mPrice && minute?.length ? minute[minute.length - 1].close : last.close;
    const details = [];
    if (options.use1mPrice && !minute) details.push(`1m price unavailable; using chart close${outcomes[2].reason ? ` (${outcomes[2].reason.message})` : ''}.`);
    outcomes.slice(0, 2).forEach((outcome, i) => {
      const element = $(i === 0 ? 'pd-4h' : 'pd-1d');
      if (!options.premiumEnabled) { element.textContent = 'Disabled'; return; }
      if (outcome.status === 'fulfilled') {
        htf[higher[i]] = calculateStructure(outcome.value, { ...options, sensitivity: i === 0 ? options.sensitivity4h : options.sensitivity1d });
        element.textContent = rangeStatus(htf[higher[i]], price);
      } else {
        element.textContent = 'Unavailable'; element.title = outcome.reason.message;
        details.push(`${i === 0 ? '4H' : '1D'}: ${outcome.reason.message}`); setStatus('Some data unavailable', 'error');
      }
    });
    if (options.showVp && structure.fib) {
      const end = options.vpEndAtExtreme ? structure.fib.extremeIndex : data.length - 1;
      const leg = data.slice(structure.fib.start, end + 1);
      const seconds = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400 }[interval];
      let missingIntrabars = false;
      const volumeCandles = leg.flatMap(c => {
        if (!options.vpUseLtf || interval === '1min' || !minute) return [c];
        const bars = minute.filter(m => m.time >= c.time && m.time < c.time + seconds);
        if (!bars.length || minute[0].time > c.time) { missingIntrabars = true; return [c]; }
        return bars;
      });
      profile = calculateVolumeProfile(volumeCandles, structure.fib, options);
      if (missingIntrabars) details.push('Some 1m history is missing; chart-bar volume is used for those bars when available.');
      if (!minute && options.vpUseLtf && interval !== '1min') details.push(`1m intrabars unavailable; chart-bar volume is used when available${outcomes[2].status === 'rejected' ? ` (${outcomes[2].reason.message})` : ''}.`);
      $('vp-status').textContent = profile.error ? 'Unavailable' : 'Available';
      if (profile.error) details.push(`Volume profile: ${profile.error}`);
    } else $('vp-status').textContent = options.showVp ? 'No active leg' : 'Disabled';
    $('data-details').textContent = details.join(' ');
    draw();
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
    next[key] = type === 'checkbox' ? input.checked : type === 'number' || key === 'scannerMinScore' ? Number(input.value) : input.value;
  }
  const names = next.scannerSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!names.length || names.length > 15 || names.some(name => !symbols.includes(name)) || new Set(names).size !== names.length) {
    const field = document.getElementById('setting-scannerSymbols');
    field.setCustomValidity('Enter 1–15 distinct supported symbols, separated by commas.');
    field.reportValidity(); field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
    return;
  }
  next.scannerSymbols = names.join(',');
  options = next; localStorage.setItem('pivot-indicator-settings', JSON.stringify(options));
  if (scanController) scanController.abort();
  $('scan-results').replaceChildren(); $('scan-status').textContent = 'Settings changed · run scan again';
  $('indicator-settings').close(); load();
});
$('scan-button').addEventListener('click', async () => {
  const key = localStorage.getItem('pivot-api-key');
  if (!key) { $('scan-status').textContent = 'Connect a Twelve Data API key before scanning.'; return; }
  if (scanController) scanController.abort();
  scanController = new AbortController();
  const signal = scanController.signal, scanOptions = { ...options };
  const names = scanOptions.scannerSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const found = [], errors = [];
  $('scan-button').disabled = true; $('scan-results').replaceChildren();
  try {
    for (const [index, symbol] of names.entries()) {
      if (signal.aborted) return;
      $('scan-status').textContent = `Scanning ${index + 1} of ${names.length}: ${symbol}…`;
      try {
        const candles = await fetchCandles(symbol, scanOptions.scannerTimeframe, key, signal);
        const higher = scanOptions.scannerHtf === scanOptions.scannerTimeframe ? candles : await fetchCandles(symbol, scanOptions.scannerHtf, key, signal);
        const setup = scanSetup(candles, higher, scanOptions);
        if (setup && setup.score >= scanOptions.scannerMinScore) found.push({ symbol, ...setup });
      } catch (error) {
        if (error.name === 'AbortError') return;
        errors.push(`${symbol}: ${error.message}`);
      }
    }
    found.sort((a, b) => b.score - a.score);
    for (const result of found.slice(0, scanOptions.scannerRows)) {
      const row = document.createElement('div'), button = document.createElement('button'), direction = document.createElement('span'), score = document.createElement('strong');
      row.className = 'scan-result'; button.type = 'button'; button.textContent = result.symbol;
      button.addEventListener('click', () => { select.value = result.symbol; load(); });
      direction.textContent = result.direction === 1 ? 'BUY' : 'SELL'; direction.className = result.direction === 1 ? '' : 'sell';
      score.textContent = String(result.score); row.title = `BOS: ${result.bos}; liquidity: ${result.liquidity}; FVG: ${result.fvg}; HTF alignment: ${result.alignment}`;
      row.append(button, direction, score); $('scan-results').append(row);
    }
    $('scan-status').textContent = `${found.length ? `${found.length} qualifying setups` : 'No qualifying setups'}${errors.length ? ` · ${errors.length} symbols unavailable: ${errors.join(' ')}` : ''}`;
  } finally { $('scan-button').disabled = false; }
});
symbolText();
if (initChart()) load();
