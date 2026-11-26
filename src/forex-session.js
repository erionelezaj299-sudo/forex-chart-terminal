const newYorkHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23',
});

export function forexFourHourStart(time) {
  const hour = Number(newYorkHour.format(new Date(time * 1000)));
  return Math.floor(time / 3600) * 3600 - ((hour + 3) % 4) * 3600;
}

export function aggregateForexFourHour(hourly, now = Date.now() / 1000) {
  const groups = new Map();
  for (const candle of hourly) {
    const start = forexFourHourStart(candle.time);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(candle);
  }
  const result = [];
  for (const [time, bars] of groups) {
    const contiguous = bars.every((bar, i) => bar.time === time + i * 3600);
    const open = time <= now && now < time + 14400;
    const expected = open ? Math.floor((now - time) / 3600) + 1 : 4;
    if (!contiguous || bars.length !== expected) continue;
    const candle = {
      time, open: bars[0].open, high: Math.max(...bars.map(bar => bar.high)),
      low: Math.min(...bars.map(bar => bar.low)), close: bars[bars.length - 1].close,
    };
    if (bars.every(bar => Number.isFinite(bar.volume))) candle.volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
    result.push(candle);
  }
  if (!result.length) throw new Error('No complete New York-aligned 4H candles are available from biquote.');
  return result;
}
