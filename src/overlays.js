export function drawStructureLine(ctx, x1, x2, y, { label, color, width }) {
  if ([x1, x2, y].some(value => value === null)) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.font = '10px DM Sans';
  ctx.fillStyle = color;
  ctx.fillText(label, (x1 + x2 - ctx.measureText(label).width) / 2, y - 4);
}
