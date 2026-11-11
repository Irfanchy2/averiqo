# Algorithms

All algorithms are causal: the value at bar *i* uses bars `0..i` only. Tests enforce this
(`test_indicators_are_causal`, `test_no_repaint_snapshot_equals_prefix_analysis`,
`test_signal_identical_with_truncated_future`).

## Market structure (`services/quant/app/structure/detector.py`)

| Structure | Rule | Knowable at |
|---|---|---|
| Swing high/low | `high[i]` strictly above the *k* bars before it and ≥ the *k* bars after it (k=3) | `i + k` |
| HH / LH / HL / LL | Compared with the previous swing of the same kind | swing confirmation |
| BOS / CHoCH | A close beyond the latest unbroken confirmed swing. CHoCH if it breaks against the current trend, BOS otherwise | break bar |
| Trend | State machine driven by BOS/CHoCH | each bar |
| Order block | The last opposite-colour candle (within 10 bars) before the extreme that preceded a BOS/CHoCH. Quality uses displacement in ATR, whether an FVG formed, CHoCH vs BOS, and whether it is untested | break bar |
| FVG | `low[i] > high[i-2]` (bullish) or `high[i] < low[i-2]` (bearish), size ≥ 0.15 ATR. Touched/filled tracked | bar *i* |
| Supply/demand | A base of ≤3 bars, each with range < 0.8 ATR, followed by a 3-bar same-direction impulse > 2 ATR | impulse end |
| S/R zone | Swing prices clustered within 0.5 ATR, needing ≥ 2 touches. Role is set relative to the current price | last member confirmation |
| Equal highs/lows | Untaken swings within 0.15 ATR of each other | second swing |
| BSL / SSL | Untaken swing highs/lows. **Inferred** resting-stop liquidity, not order-book data | swing confirmation |
| Liquidity sweep | A wick beyond an active swing level with the close back inside | sweep bar |
| Breakout / failed | A close beyond a swing level. Failed if price closes back within 3 bars | break / failure bar |
| Trendline / channel | Through the last two higher lows (or lower highs), checked for close violations; the channel rail is a parallel line through the opposite extreme | second anchor |
| Fibonacci | The most extreme swing high/low of the last 8 swings. Premium/discount split at 0.5 | anchors |
| PDH/PDL/PWH/PWL | Previous UTC day / ISO week extremes | — |
| Sessions | Asia 00–08, London 07–16, New York 12–21 UTC high/low (intraday TFs only) | — |

## Decision engine (`app/engine/decision.py`)

| Layer | Inputs | Output |
|---|---|---|
| L1 HTF direction | HTF structure trend (0.4), EMA50 vs EMA200 (0.3), close vs EMA50 (0.3) | bullish/bearish if \|score\| ≥ 0.35 |
| L2 Structure & zones | LTF trend, nearest same-direction OB / S&D / FVG within 1 ATR, premium/discount | location |
| L3 Liquidity | Sweep (≤12 bars), failed breakout, BOS/CHoCH (≤20 bars) in direction | trigger |
| L4 Indicators | EMA21/50, VWAP side, MACD hist, RSI band + slope, Supertrend, ADX+DI. Needs **≥2 confirmations and more for than against** | confirmation |
| L5 News | High-impact event for the instrument within ±30 min | block |
| L6 Execution | Stale data, spread > 25% ATR, ATR percentile > 97% | block |
| L7 Risk/reward | SL beyond the zone / sweep extreme / last swing + 0.25 ATR (≥0.5 ATR). TP1–3 at opposing liquidity or S/R, otherwise 1R/2R/3R. **Net R:R to TP2 after costs ≥ 1.5** | block |

Status: a blocking L5/L6 → `no_trade`. HTF and LTF in conflict → `neutral`. All conditions met and R:R OK →
`bullish_setup` / `bearish_setup` (R:R fails → `no_trade`). One or two conditions missing but location or
trigger present → `wait_for_confirmation`. Otherwise `neutral`.

## Backtester (`app/backtest/engine.py`)

* Signal at the close of *t* → fill at the open of *t+1* (± half spread ± slippage). The trade is skipped if the open has already passed SL or TP1.
* Scale out 50/30/20% at TP1/TP2/TP3. After TP1 the stop moves to breakeven. Time exit after 96 bars.
* If a bar touches both SL and TP, the **stop is assumed first**. Gaps through the stop fill at the open.
* Metrics: net profit, return, win rate, profit factor, expectancy ($ and R), max drawdown, max consecutive
  losses, Sharpe on daily-resampled equity (√365), fees, and a warning when n < 30.
* Validation: a 70/30 in/out-of-sample split, and rolling walk-forward (choose parameters on each in-sample window from a small grid by
  expectancy-R, then evaluate on the next unseen window).
* Regimes (ADX/DI, ATR percentile): trending up/down, ranging, high volatility.
* Limitation: no historical calendar, so L5 is not applied in backtests (stated in every result).
