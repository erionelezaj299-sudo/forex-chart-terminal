const pointCounts = { trend: 2, horizontal: 1, vertical: 1, rectangle: 2, fib: 2, long: 3, short: 3 };
const durations = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400 };

export function validPosition(type, points) {
  const [entry, stop, target] = points.map(p => p.price);
  return type === 'long' ? stop < entry && target > entry : stop > entry && target < entry;
}

export function createDrawings({ chart, series, canvas, tool, undo, status, getData, getInterval, getReplayTime }) {
  let context = '', drawings = [], points = [], hover = null, selected = null, drag = null;
  const surface = canvas.parentElement;
  const isPosition = drawing => drawing && (drawing.type === 'long' || drawing.type === 'short');
  const visible = drawing => {
    const replayTime = getReplayTime();
    const visibleAt = Number.isFinite(drawing.replayCreatedAt) ? drawing.replayCreatedAt : Math.max(...drawing.points.map(p => p.time));
    return replayTime == null || visibleAt <= replayTime;
  };
  const copyPoints = drawing => drawing.points.map(p => ({ ...p }));
  function cancelDrag() {
    if (!drag) return;
    const cancelled = drag;
    drag = null;
    cancelled.drawing.points = cancelled.original;
    if (surface.hasPointerCapture?.(cancelled.pointerId)) surface.releasePointerCapture(cancelled.pointerId);
  }
  const key = () => `pivot-drawings-v1:${context}`;
  const say = text => { status.textContent = text; };
  const defaultMessage = 'Drawings are for analysis only; no orders are placed.';
  function save() {
    try { localStorage.setItem(key(), JSON.stringify(drawings)); }
    catch (error) { say(`Unable to save drawings: ${error.message}`); }
  }
  function setContext(source, symbol) {
    const next = `${source}:${symbol}`;
    if (context === next) return;
    cancelDrag(); selected = null; context = next; points = []; hover = null; tool.value = 'cursor'; tool.dispatchEvent(new Event('change'));
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || '[]');
      if (!Array.isArray(saved)) throw new Error('Invalid saved drawings.');
      drawings = saved.filter(d => pointCounts[d.type] && Array.isArray(d.points) && d.points.length === pointCounts[d.type] && d.points.every(p => Number.isFinite(p.time) && Number.isFinite(p.price)));
    } catch (error) { drawings = []; say(`Unable to load drawings: ${error.message}`); }
    draw();
  }
  function point(event) {
    const bars = getData(), rect = canvas.getBoundingClientRect();
    const logical = chart.timeScale().coordinateToLogical(event.clientX - rect.left);
    const price = series.coordinateToPrice(event.clientY - rect.top);
    if (!bars.length || !Number.isFinite(logical) || !Number.isFinite(price) || price <= 0 || logical < 0) return null;
    const index = Math.round(logical), last = bars[bars.length - 1];
    const time = index < bars.length ? bars[index].time : last.time + (index - bars.length + 1) * durations[getInterval()];
    return { time, price };
  }
  function coordinate(p) {
    const bars = getData();
    if (!bars.length || p.time < bars[0].time) return null;
    let lo = 0, hi = bars.length;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (bars[mid].time <= p.time) lo = mid + 1; else hi = mid; }
    const index = lo === bars.length && p.time > bars[bars.length - 1].time
      ? bars.length - 1 + (p.time - bars[bars.length - 1].time) / durations[getInterval()]
      : Math.max(0, lo - 1);
    const x = chart.timeScale().logicalToCoordinate(index), y = series.priceToCoordinate(p.price);
    return x === null || y === null ? null : { x, y };
  }
  function render(ctx, drawing, width, height) {
    if (!visible(drawing)) return;
    const xy = drawing.points.map(coordinate);
    if (xy.some(p => !p)) return;
    const [a, b, c] = xy;
    ctx.strokeStyle = '#394c65'; ctx.fillStyle = '#394c65'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (drawing.type === 'horizontal') line(0, a.y, width, a.y);
    if (drawing.type === 'vertical') line(a.x, 0, a.x, height);
    if (drawing.type === 'trend') line(a.x, a.y, b.x, b.y);
    if (drawing.type === 'rectangle') { ctx.fillStyle = '#748da62a'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    if (drawing.type === 'fib') {
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#394c65';
      for (const ratio of [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]) {
        const y = a.y + (b.y - a.y) * ratio; line(a.x, y, b.x, y); ctx.fillText(String(ratio), Math.min(a.x, b.x) + 3, y - 3);
      }
    }
    if (drawing.type === 'long' || drawing.type === 'short') {
      const left = Math.min(a.x, b.x), w = Math.abs(b.x - a.x);
      ctx.fillStyle = '#54a47b40'; ctx.fillRect(left, Math.min(a.y, c.y), w, Math.abs(c.y - a.y));
      ctx.fillStyle = '#cf706740'; ctx.fillRect(left, Math.min(a.y, b.y), w, Math.abs(b.y - a.y));
      ctx.strokeStyle = '#66778b'; line(left, a.y, left + w, a.y); line(left, b.y, left + w, b.y); line(left, c.y, left + w, c.y);
      line(left, Math.min(b.y, c.y), left, Math.max(b.y, c.y));
      line(left + w, Math.min(b.y, c.y), left + w, Math.max(b.y, c.y));
      const [entry, stop, target] = drawing.points.map(p => p.price);
      const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
      const price = n => Number(n.toPrecision(7)).toString();
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#315d48';
      ctx.fillText(`Target ${price(target)}  +${(reward / entry * 100).toFixed(2)}%`, left + 4, c.y + (c.y < a.y ? 13 : -5));
      ctx.fillStyle = '#9b4e48';
      ctx.fillText(`Stop ${price(stop)}  -${(risk / entry * 100).toFixed(2)}%`, left + 4, b.y + (b.y < a.y ? 13 : -5));
      ctx.fillStyle = '#394c65';
      ctx.fillText(`Entry ${price(entry)}  R:R ${risk ? (reward / risk).toFixed(2) : '—'}`, left + 4, a.y - 5);
      if (drawing === selected) {
        const handles = positionHandles(xy);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#376ed0'; ctx.lineWidth = 2;
        for (const handle of Object.values(handles)) {
          ctx.beginPath(); ctx.arc(handle.x, handle.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }
  function positionHandles([a, b, c]) {
    const middle = (a.x + b.x) / 2;
    return {
      entry: { x: middle, y: a.y }, stop: { x: middle, y: b.y },
      target: { x: middle, y: c.y }, width: { x: b.x, y: a.y },
    };
  }
  function hitPosition(drawing, x, y) {
    if (!isPosition(drawing) || !visible(drawing)) return null;
    const xy = drawing.points.map(coordinate);
    if (xy.some(p => !p)) return null;
    if (drawing === selected) {
      for (const [name, handle] of Object.entries(positionHandles(xy))) {
        if (Math.hypot(x - handle.x, y - handle.y) <= 8) return name;
      }
    }
    const [a, b, c] = xy;
    return x >= Math.min(a.x, b.x) - 5 && x <= Math.max(a.x, b.x) + 5 &&
      y >= Math.min(a.y, b.y, c.y) - 5 && y <= Math.max(a.y, b.y, c.y) + 5 ? 'move' : null;
  }
  function positionAt(event) {
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    for (let i = drawings.length - 1; i >= 0; i--) {
      const mode = hitPosition(drawings[i], x, y);
      if (mode) return { drawing: drawings[i], mode };
    }
    return null;
  }
  function updateDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!visible(drag.drawing)) { cancelDrag(); selected = null; draw(); return; }
    const p = point(event);
    if (!p) return;
    const next = drag.original.map(item => ({ ...item }));
    const deltaPrice = p.price - drag.start.price, deltaTime = p.time - drag.start.time;
    if (drag.mode === 'move') {
      for (const item of next) { item.price += deltaPrice; item.time += deltaTime; }
    } else if (drag.mode === 'width') {
      next[1].time += deltaTime;
    } else {
      const index = { entry: 0, stop: 1, target: 2 }[drag.mode];
      next[index].price += deltaPrice;
    }
    if (next.some(item => item.price <= 0 || item.time < getData()[0].time) ||
        (next[1].time - next[0].time) * (drag.original[1].time - drag.original[0].time) <= 0 ||
        !validPosition(drag.drawing.type, next)) return;
    drag.drawing.points = next;
    draw();
  }
  function draw() {
    const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    for (const item of drawings) render(ctx, item, rect.width, rect.height);
    if (hover && points.length && pointCounts[tool.value] === 2) render(ctx, { type: tool.value, points: [points[0], hover], replayCreatedAt: getReplayTime() }, rect.width, rect.height);
    if (hover && points.length === 2 && isPosition({ type: tool.value })) {
      const preview = [points[0], points[1], hover];
      if (validPosition(tool.value, preview)) render(ctx, { type: tool.value, points: preview, replayCreatedAt: getReplayTime() }, rect.width, rect.height);
    }
  }
  tool.addEventListener('change', () => {
    cancelDrag(); selected = null;
    surface.style.cursor = '';
    points = []; hover = null; canvas.classList.toggle('active', tool.value !== 'cursor');
    say(tool.value === 'cursor' ? defaultMessage : ['long', 'short'].includes(tool.value) ? 'Click entry, stop, then target. These drawings do not place orders.' : 'Click the chart to place the drawing. Esc cancels.');
    draw();
  });
  surface.addEventListener('pointerdown', event => {
    if (tool.value !== 'cursor' || event.button !== 0) return;
    const hit = positionAt(event);
    if (!hit) { if (selected) { selected = null; draw(); } return; }
    const start = point(event);
    if (!start) return;
    event.preventDefault(); event.stopPropagation();
    selected = hit.drawing;
    drag = { ...hit, start, original: copyPoints(hit.drawing), pointerId: event.pointerId };
    surface.setPointerCapture(event.pointerId);
    say('Drag the center handles to adjust entry, stop or target; drag the right handle for width, or the shaded area to move. Esc cancels.');
    draw();
  }, true);
  surface.addEventListener('pointermove', event => {
    if (tool.value !== 'cursor') return;
    if (drag) { event.preventDefault(); event.stopPropagation(); updateDrag(event); return; }
    const hit = positionAt(event);
    surface.style.cursor = hit ? (hit.mode === 'width' ? 'ew-resize' : hit.mode === 'move' ? 'move' : 'ns-resize') : '';
  }, true);
  surface.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    updateDrag(event);
    if (drag) { drag = null; save(); }
    draw();
  }, true);
  surface.addEventListener('pointercancel', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    cancelDrag(); draw();
  }, true);
  surface.addEventListener('lostpointercapture', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    cancelDrag(); draw();
  });
  canvas.addEventListener('pointermove', event => { hover = point(event); draw(); });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !pointCounts[tool.value]) return;
    const p = point(event);
    if (!p) { say('Choose a price within the chart.'); return; }
    points.push(p);
    if (['long', 'short'].includes(tool.value) && points.length === 2 && points[0].time === points[1].time) { points.pop(); say('Choose a different bar for the right edge of the position.'); draw(); return; }
    if (points.length === pointCounts[tool.value]) {
      if (['long', 'short'].includes(tool.value) && !validPosition(tool.value, points)) {
        points = []; say(tool.value === 'long' ? 'For a long, stop must be below entry and target above it. Try again.' : 'For a short, stop must be above entry and target below it. Try again.'); draw();
        return;
      }
      const replayCreatedAt = getReplayTime();
      const created = replayCreatedAt == null ? { type: tool.value, points } : { type: tool.value, points, replayCreatedAt };
      drawings.push(created); points = []; hover = null; save();
      tool.value = 'cursor'; tool.dispatchEvent(new Event('change'));
      if (isPosition(created)) { selected = created; say('Position selected. Drag the handles or shaded area to adjust it. No orders are placed.'); }
    } else if (['long', 'short'].includes(tool.value)) say(points.length === 1 ? 'Click the stop and right edge of the position.' : 'Click the target price.');
    draw();
  });
  undo.addEventListener('click', () => { if (!drawings.length) { say('No drawing to undo.'); return; } cancelDrag(); const removed = drawings.pop(); if (selected === removed) selected = null; save(); draw(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (tool.value !== 'cursor') { tool.value = 'cursor'; tool.dispatchEvent(new Event('change')); }
    else if (drag) { cancelDrag(); say('Adjustment cancelled.'); draw(); }
    else if (selected) { selected = null; say(defaultMessage); draw(); }
  });
  return { setContext, draw };
}
