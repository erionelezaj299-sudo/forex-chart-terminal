# Pivot forex workspace

A static, light-theme forex chart. The default [biquote](https://biquote.io/docs/) feed supplies prices and tick counts without an API key. Choose a major or minor pair or XAU/USD and a timeframe. biquote supplies a limited rolling history (for example 180 closed 4H bars and 300 closed 1m bars), and availability depends on its feed. Prices are fetched on demand, not streamed, and may be stale or delayed.

Alternatively, choose [Twelve Data](https://twelvedata.com/) in data settings and enter an API key. Symbol and history access depends on its plan and requests consume API credits. The key is stored in browser local storage and sent directly to Twelve Data. It is not secret from anyone with access to that browser. Do not use a privileged key on a shared device; use provider-side restrictions if available. Remove it via settings. Neither feed is simulated.

## Indicator coverage

The supplied Pine script cannot run directly in Lightweight Charts. This site ports its pivot/ATR-filtered market structure, latest BOS, liquidity sweep, fractals, Fibonacci levels, FVGs, 4H/1D premium/discount classifications, fixed-range volume profile and manual checklist. Higher-timeframe lines are hidden and the CP scanner has been removed. The **Indicator** button configures the main calculation, display and profile inputs; settings persist in this browser.

The port is **not guaranteed to match TradingView**. It uses up to 500 chart/HTF candles, different provider prices and history, strict pivot tie handling and only the latest higher-timeframe snapshot, rather than replaying Pine's `request.security` lookahead behavior on every historical bar. Some Pine appearance and table-position settings and alternate intrabar timeframes are not exposed. The 1m price is used for classification when available, otherwise the chart close is used and the fallback is reported. The chart refreshes on demand rather than streaming updates.

The profile distributes each candle's reported volume proportionally over overlapping price rows, within the active fib leg. For biquote it uses **tick counts**, not traded volume: decentralized forex has no single exchange-wide volume. biquote's 1m window is limited; where it does not cover an entire chart bar, the profile falls back to that chart bar's tick count. Thus the profile may differ from TradingView's finer intrabar profile. biquote says historical data can originate from multiple feeds; missing or zero tick counts are treated as unavailable, not invented. With Twelve Data, intrabar requests ask for up to 5,000 recent 1m candles and fall back to chart-bar volume when necessary. Twelve Data's EUR/USD demo has no volume, so its profile may be unavailable. The app refuses to draw a profile if required volume is absent or not positive; data errors are shown in the interface.

The checklist is manually checked and is not an automated recommendation. This software is not financial advice.

## Run and publish

Serve this directory with any static HTTP server, then open its URL. The chart library and fonts are loaded from external CDNs; the browser needs internet access. Do not open the HTML directly as a file, because it uses JavaScript modules.

For GitHub Pages, make the repository public or use an account plan that supports private-repository Pages. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then merge or push the site to `main`. The included workflow deploys on pushes to `main` or can be run manually. A published Pages site is public even when its source repository is private.

Run the focused calculations tests with `npm test` (Node.js 18+); there are no npm dependencies.
