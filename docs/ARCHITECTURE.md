# Architecture

```
┌─────────────────────────── Browser ───────────────────────────┐
│ Next.js terminal (apps/web)                                    │
│  • Lightweight Charts + DrawingsPrimitive (zones/levels/lines) │
│  • REST → same-origin /api/* proxy        • WS → /ws (bars)    │
└──────────────┬──────────────────────────────────┬──────────────┘
               │ /api/* (token added server-side)  │ ws
┌──────────────▼──────────────────────────────────▼──────────────┐
│ FastAPI quant service (services/quant)                          │
│  api/        REST routers, auth, rate limit, security headers   │
│  data/       MarketDataProvider ─ Simulated | BinancePublic     │
│  indicators/ causal indicator library                           │
│  structure/  StructureAnalysis (event scan) → snapshot(t)       │
│  engine/     MarketContext, 7-layer evaluate(), AnalysisService │
│  risk/       RiskConfig, validate(), position_size()            │
│  paper/      PaperBroker (fills, SL/TP, kill switch)            │
│  execution/  mode gate: analysis | paper | live                 │
│  backtest/   run_backtest, out_of_sample, walk_forward          │
│  news/       CalendarProvider, blackout, impact guide           │
│  assistant/  grounded EN/BN Q&A                                 │
│  brokers/    adapter contract, registry, encrypted vault        │
│  db/         SQLAlchemy models, hash-chained audit              │
│  background: paper loop (1 s) → WS notifications                │
└──────────────┬───────────────────────────────┬─────────────────┘
          PostgreSQL (SQLite in dev)        Redis (reserved: Phase 2 fan-out / shared rate limits)
```

## Key design decisions

1. **One code path for live and historical analysis.** `StructureAnalysis` scans the history once and records,
   for every event, the bar index where it became knowable (`confirmed_idx`) and where its state changed
   (touched, mitigated, invalidated, consumed). `snapshot(t)` rebuilds exactly what was knowable at the close of bar `t`.
   Live analysis is `snapshot(n-1)`. The backtester calls `snapshot(t)` on every bar. A test asserts that
   `snapshot(t)` on the full history matches a fresh analysis of `history[:t+1]`, so drawings never repaint and
   backtests have no look-ahead.
2. **Deterministic rules execute; language only explains.** The decision engine is plain Python with
   versioned parameters (`structure_confluence_v1`). The assistant only rephrases computed facts and returns the
   evidence it used. An optional LLM layer (Phase 2) is limited to the same role.
3. **Calibrated confidence or none.** The setup "quality" (0–100) is a transparent heuristic, labelled as such.
   The *confidence* shown to users is the historical win rate and expectancy of the same rules in the same quality
   bucket on that symbol/timeframe. It is only shown when the sample has n ≥ 30.
4. **Only closed candles are analysed.** `closed_candles()` drops the forming bar. The chart still streams it.
5. **Higher-timeframe alignment without leakage.** `htf_idx[t]` points to the last HTF bar *closed* by the
   LTF bar's close.
6. **Risk checks are centralised and exhaustive.** Every order goes through `risk.validate()`, which reports all
   checks (not only the first failure) so the UI and the audit log show the full picture.
7. **Trading modes are separate.** `execution.submit_order` routes by mode. Live needs a server env flag,
   explicit user opt-in with a confirmation phrase, a verified credential, a verified adapter and no kill switch.

## Market-data ingestion pipeline

```
Provider.candles(symbol, tf) ──► closed_candles() ──► AnalysisService.context()  (cached per last closed bar)
        │                                              ├─ IndicatorSet (LTF/HTF)
        │                                              ├─ StructureAnalysis (LTF/HTF)
        │                                              └─ htf_idx alignment
        └─► WebSocket /ws: every 1 s push forming bar + quote; emits `bar_closed` → clients refetch analysis
```

* Simulated feed: a 5-minute base series over 420 days (Student-t returns, Markov regimes, session-dependent
  volatility, weak mean reversion), refined into 1-minute bars over the last 10 days. Each 1m bar aggregates exactly
  to its parent, so every timeframe agrees.
* Real feeds plug in by implementing `MarketDataProvider.candles()` and `quote()`. On failure a provider raises
  `DataUnavailable`. The platform never substitutes fabricated data. Orders are rejected and the UI shows the error.
* **Staleness:** quote age is checked against `stale_price_seconds` in the risk engine and in decision layer 6.

## Chart drawing engine

`apps/web/src/components/chart/drawings-primitive.ts` is a Lightweight Charts *series primitive*:

* It converts drawings into `rect` and `segment` shapes. Time maps to x through the fractional bar index
  (`logicalToCoordinate`), so shapes stay aligned at any zoom and for timestamps between bars.
* Zones extend to the right edge until they are invalidated. Trendlines are drawn as sloped segments.
  Fibonacci is drawn as a level ladder.
* Label collision avoidance keeps the right edge readable. The hovered shape is drawn last and highlighted.
* Hit-testing drives a tooltip with label, price, status, reason, quality, invalidation and detection time.
* Swings, BOS/CHoCH and sweeps use the native series markers plugin.
* Colours can be set per drawing type (Settings). Visibility can be toggled per type (Drawings panel, `D` key).

## 3D market view

`apps/web/src/components/chart/chart-3d.tsx` renders the same candles and drawings with three.js:

* Axes: x is time (latest candle at x = 0), y is price (the visible range is mapped to 0..80), z is depth.
* Candles, wicks and volume are three `InstancedMesh`es (one draw call each). The forming bar is updated in place
  without rebuilding the scene. The scene is rebuilt only when a new bar arrives or price leaves the mapped range.
* Zones (OB, FVG, supply/demand, S/R) are translucent boxes with edge outlines. Their depth encodes the type
  (S/R deepest, FVG thinnest). Liquidity is a dashed line plus a horizontal ribbon and stays labelled "inferred".
  Swings are emissive orbs and sweeps are cones. The trade plan is stacked planes.
* Raycasting on zones, lines and markers drives the same `DrawingTooltip` as 2D. OrbitControls handle
  orbit, zoom and pan, and there is a reset-camera button.
* Render loop: one `requestAnimationFrame` per view. Everything is disposed on unmount. If WebGL is unavailable, a notice
  asks the user to switch back to 2D.
* For exact price reading the 2D view stays the reference. 3D is for spatial context.

## Scaling notes

The paper loop and WebSocket hub run in-process, so the service runs with **one worker**. To scale out:
move the paper loop to a dedicated worker, publish bar and notification events through Redis pub/sub, and keep
API replicas stateless. Rate limiting is per process today. Move it to Redis (`INCR` + `EXPIRE`) once there is
more than one replica.
