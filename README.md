# Pivot forex workspace

A static, light-theme forex chart. Select a major or minor pair or XAU/USD, choose a timeframe, and enter a [Twelve Data](https://twelvedata.com/) API key using the settings button. There is no sample or simulated price feed. Prices can be delayed, and availability of symbols (especially gold), history and timeframes depends on the provider and your subscription. The app requests up to 500 candles for the selected chart plus 4H and daily data; requests consume API credits. Errors and unavailable higher-timeframe data are displayed in the interface.

The key is stored in browser local storage and sent directly from the browser to Twelve Data. It is not secret from anyone with access to that browser. Do not use a privileged key on a shared device; use provider-side restrictions if available. Remove it via settings.

## Indicator coverage

The supplied Pine script cannot run directly in Lightweight Charts. This site ports its pivot/ATR-filtered market structure, latest BOS, liquidity sweep, fractals, Fibonacci levels, FVGs, 4H/1D range lines and classification, fixed-range volume profile, manual checklist and on-demand CP scanner. The **Indicator** button configures the main calculation, display, profile and scanner inputs; settings persist in this browser.

The port is **not guaranteed to match TradingView**. It uses up to 500 chart/HTF candles, different provider prices and history, strict pivot tie handling and only the latest higher-timeframe snapshot, rather than replaying Pine's `request.security` lookahead behavior on every historical bar. Some Pine appearance and table-position settings and alternate intrabar timeframes are not exposed. The 1m price is used for classification when available, otherwise the chart close is used and the fallback is reported. The chart refreshes on demand rather than streaming updates.

The profile distributes each candle's reported volume proportionally over overlapping price rows, within the active fib leg. With intrabar volume enabled it requests up to 5,000 recent 1m candles, falling back to chart-bar volume for unavailable 1m history. It refuses to draw a profile if any required bar lacks volume, or if there is no positive volume. **Twelve Data's EUR/USD demo responses do not include volume**, so the profile reports unavailable for that feed; availability varies by instrument and provider plan. Forex volume, when supplied, may be tick or provider-specific volume, not centralized exchange volume. Missing history, rate limits and data-provider errors are shown in the interface rather than replaced with synthetic data.

Run the scanner explicitly: it requests up to two time series per configured symbol (15 by default) and can exhaust rate limits or daily credits. Errors identify unavailable symbols, and partial results are not a complete scan. The checklist is manually checked and is not the scanner or an automated recommendation. This software is not financial advice.

## Run and publish

Serve this directory with any static HTTP server, then open its URL. The chart library and fonts are loaded from external CDNs; the browser needs internet access. Do not open the HTML directly as a file, because it uses JavaScript modules.

For GitHub Pages, make the repository public or use an account plan that supports private-repository Pages. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then merge or push the site to `main`. The included workflow deploys on pushes to `main` or can be run manually. A published Pages site is public even when its source repository is private.

Run the focused calculations tests with `npm test` (Node.js 18+); there are no npm dependencies.
