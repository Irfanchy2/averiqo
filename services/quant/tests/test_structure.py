import numpy as np

from app.structure.detector import StructureAnalysis, build_drawings
from tests.conftest import make_candles


def zigzag(legs):
    """Build a close series from (target, bars) legs."""
    out = [legs[0][0]]
    for target, bars in legs[1:]:
        out += list(np.linspace(out[-1], target, bars + 1)[1:])
    return out


def test_uptrend_labels_and_bos():
    closes = zigzag([(100, 0), (110, 8), (105, 6), (118, 8), (112, 6), (126, 8), (120, 6), (130, 8)])
    sa = StructureAnalysis(make_candles(closes, spread=0.2), "1h", swing_k=2)
    labels = [s.label for s in sa.swings if s.label]
    assert "HH" in labels and "HL" in labels
    assert "LL" not in labels
    assert any(b.kind == "BOS" and b.direction == "bullish" for b in sa.breaks)
    assert sa.trend_at[-1] == 1


def test_choch_on_reversal():
    up = [(100, 0), (110, 8), (105, 6), (118, 8), (112, 6), (122, 8)]
    down = [(108, 10), (114, 6), (100, 10), (106, 6), (95, 10)]
    sa = StructureAnalysis(make_candles(zigzag(up + down), spread=0.2), "1h", swing_k=2)
    kinds = [(b.kind, b.direction) for b in sa.breaks]
    assert ("CHoCH", "bearish") in kinds
    assert sa.trend_at[-1] == -1


def test_fvg_detection():
    closes = [100.0] * 25 + [100.5, 104.0, 108.0, 108.5] + [108.5] * 10
    c = make_candles(closes, spread=0.2)
    sa = StructureAnalysis(c, "1h", swing_k=2)
    assert any(f.direction == "bullish" for f in sa.fvgs)


def test_liquidity_sweep():
    base = zigzag([(100, 0), (110, 8), (104, 6), (112, 8), (106, 6)])
    c = make_candles(base + [106.0] * 3, spread=0.2)
    # inject a wick below the last swing low (≈104) that closes back above it
    low = c.low.copy(); low[-1] = 102.0
    from app.core.types import Candles
    c2 = Candles(c.time, c.open, c.high, low, c.close, c.volume)
    sa = StructureAnalysis(c2, "1h", swing_k=2)
    assert any(s.direction == "bullish" for s in sa.sweeps)


def test_no_repaint_snapshot_equals_prefix_analysis(candles_1h):
    """The core anti-look-ahead guarantee: snapshot(t) on full history == analysis of history[:t+1]."""
    full = StructureAnalysis(candles_1h, "1h")
    for t in (250, 400, 611):
        prefix = StructureAnalysis(candles_1h.slice(0, t + 1), "1h")
        a = build_drawings(full, full.snapshot(t), "BTCUSDT")
        b = build_drawings(prefix, prefix.snapshot(), "BTCUSDT")
        assert [d["id"] for d in a] == [d["id"] for d in b]
        assert [d["status"] for d in a] == [d["status"] for d in b]
        assert full.trend_at[t] == prefix.trend_at[-1]


def test_drawings_have_required_fields(candles_1h):
    sa = StructureAnalysis(candles_1h, "1h")
    drawings = build_drawings(sa, sa.snapshot(), "BTCUSDT")
    kinds = {d["kind"] for d in drawings}
    assert {"swing", "structure_break", "fibonacci", "liquidity"} <= kinds
    for d in drawings:
        for key in ("label", "timeframe", "detected_at", "reason", "quality", "invalidation"):
            assert d[key] not in (None, ""), (d["kind"], key)
        assert 0 <= d["quality"] <= 100
        assert d["price"] is not None or d["top"] is not None or d["points"]
    assert all(d["inferred"] for d in drawings if d["kind"] in ("liquidity", "liquidity_sweep"))


def test_snapshot_never_contains_future_events(candles_1h):
    sa = StructureAnalysis(candles_1h, "1h")
    t = 300
    s = sa.snapshot(t)
    assert all(x.confirmed_idx <= t for x in s.swings)
    assert all(b.idx <= t for b in s.breaks)
    assert all(o.created_idx <= t and o.invalidated_idx > t for o in s.order_blocks)
    assert all(f.idx <= t and f.filled_idx > t for f in s.fvgs)
