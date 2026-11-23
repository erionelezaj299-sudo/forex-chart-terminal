const seconds = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400 };
const ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

export function candleEnd(time, interval, provider) {
  if (!Number.isFinite(time) || !seconds[interval]) return null;
  if (provider === 'oanda' && interval === '1day') {
    for (let hours = 22; hours <= 26; hours++) {
      const candidate = time + hours * 3600;
      const parts = ny.formatToParts(new Date(candidate * 1000));
      if (parts.find(p => p.type === 'hour')?.value === '17' && parts.find(p => p.type === 'minute')?.value === '00') return candidate;
    }
    return null;
  }
  return time + seconds[interval];
}

export function candleCountdown(time, interval, provider, now = Date.now() / 1000) {
  const end = candleEnd(time, interval, provider);
  if (end === null) return 'Candle close unavailable';
  const left = Math.ceil(end - now);
  if (left <= 0) return 'Candle closed · awaiting next';
  const hours = Math.floor(left / 3600), minutes = Math.floor(left % 3600 / 60), secs = left % 60;
  return `Candle closes in ${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
