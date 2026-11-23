# Pivot forex workspace

A static, light-theme forex chart. Select a major or minor pair or XAU/USD, choose a timeframe, and enter a [Twelve Data](https://twelvedata.com/) API key using the settings button. There is no sample or simulated price feed. Prices can be delayed, and availability of symbols (especially gold), history and timeframes depends on the provider and your subscription. The app requests up to 500 candles for the selected chart plus 4H and daily data; requests consume API credits. Errors and unavailable higher-timeframe data are displayed in the interface.

The key is stored in browser local storage and sent directly from the browser to Twelve Data. It is not secret from anyone with access to that browser. Do not use a privileged key on a shared device; use provider-side restrictions if available. Remove it via settings.

## Indicator coverage

The supplied Pine script cannot run directly in Lightweight Charts. This site implements **approximate** versions of its default local pivot/ATR-filtered structure, latest BOS, liquidity sweep, major fractals, 0/0.71/1 Fibonacci levels, fair value gaps on the active leg, manual checklist and 4H/1D premium/discount classifications. The calculations use the loaded history and Twelve Data's price feed rather than TradingView's feed. Pivot tie handling, Pine historical execution, timeframe alignment and the higher-timeframe lookahead semantics differ, so results are not guaranteed to match TradingView.

The scanner, configurable Pine inputs, higher-timeframe range lines, alerts, and fixed-range volume profile are **not implemented**. Forex volume is provider-dependent and the supplied Pine profile requests lower-timeframe volume; no volume profile is estimated or invented. The checklist is manually checked and is not the scanner or an automated recommendation. This software is not financial advice.

## Run and publish

Serve this directory with any static HTTP server, then open its URL. The chart library and fonts are loaded from external CDNs; the browser needs internet access. Do not open the HTML directly as a file, because it uses JavaScript modules.

For GitHub Pages, make the repository public or use an account plan that supports private-repository Pages. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then merge or push the site to `main`. The included workflow deploys on pushes to `main` or can be run manually. A published Pages site is public even when its source repository is private.

Run the focused calculations tests with `npm test` (Node.js 18+); there are no npm dependencies.
