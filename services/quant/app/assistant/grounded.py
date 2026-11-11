"""Grounded chart assistant (English + Bengali).

Answers are assembled ONLY from computed analysis, setups, calendar entries and the trade
journal — every number cited comes from those objects, and each answer returns the `evidence`
it used. An optional LLM layer (Phase 2) may rephrase these grounded facts but must not add
new facts; deterministic rules stay in charge of any execution.
"""
from __future__ import annotations

import datetime as dt
import re

BN_RE = re.compile(r"[ঀ-৿]")

SYMBOL_ALIASES = {
    "BTCUSDT": ["btc", "bitcoin", "বিটকয়েন"], "ETHUSDT": ["eth", "ether", "ইথেরিয়াম"],
    "XAUUSD": ["gold", "xau", "সোনা", "গোল্ড"], "EURUSD": ["eurusd", "euro", "ইউরো"],
    "GBPUSD": ["gbp", "pound", "cable"], "USDJPY": ["jpy", "yen"], "USOIL": ["oil", "wti", "crude", "তেল"],
}

INTENTS = [
    ("rejected", ["reject", "why no trade", "why not", "বাতিল", "প্রত্যাখ্যান", "কেন ট্রেড নেই"]),
    ("losing_trade", ["losing trade", "last loss", "lost", "লস", "ক্ষতি", "লোকসান"]),
    ("news", ["news", "event", "calendar", "cpi", "fomc", "nfp", "খবর", "নিউজ", "ইভেন্ট"]),
    ("sweep", ["sweep", "liquidity", "লিকুইডিটি", "সুইপ"]),
    ("order_block", ["order block", "orderblock", " ob", "অর্ডার ব্লক"]),
    ("resistance", ["resistance", "রেজিস্ট্যান্স", "প্রতিরোধ"]),
    ("support", ["support", "সাপোর্ট", "সমর্থন"]),
    ("draw", ["draw", "structure", "স্ট্রাকচার", "আঁক"]),
    ("bias", ["bullish", "bearish", "trend", "why", "বুলিশ", "বিয়ারিশ", "ট্রেন্ড", "কেন"]),
]

T = {
    "en": {
        "bias": "{sym} on {tf} is {trend}. Higher timeframe ({htf}) bias: {htf_verdict} (score {htf_score}).",
        "no_data": "I don't have that information in the current analysis.",
        "res": "Nearest resistance on {tf}: {bot}–{top} ({touches} touches), {dist:.2f}× ATR above price {price}.",
        "sup": "Nearest support on {tf}: {bot}–{top} ({touches} touches), {dist:.2f}× ATR below price {price}.",
        "no_res": "No clustered resistance zone above price in the analysed window. Nearest untaken buy-side liquidity: {liq}.",
        "no_sup": "No clustered support zone below price in the analysed window. Nearest untaken sell-side liquidity: {liq}.",
        "sweeps": "Recent liquidity sweeps on {tf} (inferred from price, not order-book data):",
        "no_sweeps": "No liquidity sweeps in the analysed window on {tf}.",
        "ob": "{side} order block {bot}–{top} formed before a {kind} with {disp:.1f}× ATR displacement{fvg}. Status: {status}. Invalid on a close {inv_side} {inv}.",
        "no_ob": "No active order blocks on {tf}.",
        "status": "Current decision for {sym} {tf}: {status}.",
        "missing": "Missing conditions: {m}.",
        "against": "Reasons against:",
        "news_hdr": "Scheduled events affecting {sym} in the next 24h ({src}):",
        "no_news": "No scheduled high/medium-impact events for {sym} in the next 24h in the configured calendar ({src}).",
        "loss": "Last losing trade: {side} {sym} entered {entry} → exited {exit} ({reason}), P&L {pnl}.",
        "no_loss": "No losing trades in the journal yet.",
        "loss_setup": "At entry the engine reported status {status} with quality {q}. Reasons against at that time:",
        "draw": "Market structure drawn on the chart: {n} swing labels, {b} BOS/CHoCH, {o} order blocks, {f} FVGs.",
        "help": "I can explain trend bias, nearest support/resistance, liquidity sweeps, order blocks, rejected setups, upcoming news, and your last losing trade.",
        "sim": "Note: market data is SIMULATED.",
    },
    "bn": {
        "bias": "{tf} টাইমফ্রেমে {sym} এর ট্রেন্ড: {trend}। উচ্চতর টাইমফ্রেম ({htf}) এর দিক: {htf_verdict} (স্কোর {htf_score})।",
        "no_data": "বর্তমান বিশ্লেষণে এই তথ্য নেই।",
        "res": "{tf} এ নিকটতম রেজিস্ট্যান্স: {bot}–{top} ({touches} বার স্পর্শ), দাম {price} থেকে {dist:.2f}× ATR উপরে।",
        "sup": "{tf} এ নিকটতম সাপোর্ট: {bot}–{top} ({touches} বার স্পর্শ), দাম {price} থেকে {dist:.2f}× ATR নিচে।",
        "no_res": "বিশ্লেষিত সময়ে দামের উপরে কোনো রেজিস্ট্যান্স জোন নেই। নিকটতম বাই-সাইড লিকুইডিটি: {liq}।",
        "no_sup": "বিশ্লেষিত সময়ে দামের নিচে কোনো সাপোর্ট জোন নেই। নিকটতম সেল-সাইড লিকুইডিটি: {liq}।",
        "sweeps": "{tf} এ সাম্প্রতিক লিকুইডিটি সুইপ (দাম থেকে অনুমিত, অর্ডার-বুক ডেটা নয়):",
        "no_sweeps": "{tf} এ বিশ্লেষিত সময়ে কোনো লিকুইডিটি সুইপ নেই।",
        "ob": "{side} অর্ডার ব্লক {bot}–{top}, একটি {kind} এর আগে তৈরি, ডিসপ্লেসমেন্ট {disp:.1f}× ATR{fvg}। অবস্থা: {status}। {inv} এর {inv_side} ক্লোজ হলে বাতিল।",
        "no_ob": "{tf} এ কোনো সক্রিয় অর্ডার ব্লক নেই।",
        "status": "{sym} {tf} এর বর্তমান সিদ্ধান্ত: {status}।",
        "missing": "অনুপস্থিত শর্ত: {m}।",
        "against": "বিপক্ষের কারণ:",
        "news_hdr": "আগামী ২৪ ঘণ্টায় {sym} কে প্রভাবিত করতে পারে এমন নির্ধারিত ইভেন্ট ({src}):",
        "no_news": "কনফিগার করা ক্যালেন্ডারে ({src}) আগামী ২৪ ঘণ্টায় {sym} এর জন্য কোনো গুরুত্বপূর্ণ ইভেন্ট নেই।",
        "loss": "সর্বশেষ লস ট্রেড: {side} {sym}, এন্ট্রি {entry} → এক্সিট {exit} ({reason}), লাভ/ক্ষতি {pnl}।",
        "no_loss": "জার্নালে এখনও কোনো লস ট্রেড নেই।",
        "loss_setup": "এন্ট্রির সময় ইঞ্জিনের স্ট্যাটাস ছিল {status}, কোয়ালিটি {q}। তখনকার বিপক্ষের কারণ:",
        "draw": "চার্টে মার্কেট স্ট্রাকচার আঁকা হয়েছে: {n}টি সুইং লেবেল, {b}টি BOS/CHoCH, {o}টি অর্ডার ব্লক, {f}টি FVG।",
        "help": "আমি ট্রেন্ড, নিকটতম সাপোর্ট/রেজিস্ট্যান্স, লিকুইডিটি সুইপ, অর্ডার ব্লক, বাতিল সেটআপ, আসন্ন খবর এবং আপনার সর্বশেষ লস ট্রেড ব্যাখ্যা করতে পারি।",
        "sim": "দ্রষ্টব্য: মার্কেট ডেটা সিমুলেটেড।",
    },
}

WORDS = {
    "en": {"bullish": "bullish", "bearish": "bearish", "undefined": "undefined", "neutral": "neutral",
           "bullish_setup": "Bullish setup", "bearish_setup": "Bearish setup", "wait_for_confirmation": "Wait for confirmation",
           "no_trade": "No trade", "below": "below", "above": "above"},
    "bn": {"bullish": "বুলিশ", "bearish": "বিয়ারিশ", "undefined": "অনির্ধারিত", "neutral": "নিরপেক্ষ",
           "bullish_setup": "বুলিশ সেটআপ", "bearish_setup": "বিয়ারিশ সেটআপ", "wait_for_confirmation": "নিশ্চিতকরণের অপেক্ষা",
           "no_trade": "ট্রেড নয়", "below": "নিচে", "above": "উপরে"},
}


def detect_symbol(q: str, default: str) -> str:
    ql = q.lower()
    for sym, al in SYMBOL_ALIASES.items():
        if sym.lower() in ql or any(re.search(rf"(?<![a-z]){re.escape(a)}(?![a-z])", ql) for a in al):
            return sym
    return default


def detect_intent(q: str) -> str:
    ql = " " + q.lower()
    for name, kws in INTENTS:
        if any(k in ql for k in kws):
            return name
    return "help"


def fmt(p: float | None) -> str:
    if p is None:
        return "—"
    return f"{p:,.5f}" if abs(p) < 10 else f"{p:,.2f}"


def answer(question: str, lang: str, symbol: str, tf: str, *, analysis_fn, setup_fn, events_fn, journal_fn,
           impact_fn) -> dict:
    lang = "bn" if (lang == "bn" or BN_RE.search(question)) else "en"
    t, w = T[lang], WORDS[lang]
    sym = detect_symbol(question, symbol)
    intent = detect_intent(question)
    lines: list[str] = []
    evidence: dict = {"symbol": sym, "timeframe": tf, "intent": intent}
    actions: list[dict] = []

    if intent in ("bias", "resistance", "support", "sweep", "order_block", "draw"):
        a = analysis_fn(sym, tf)
        evidence["bar_time"] = a["bar_time"]
        atr = a["indicators"]["atr"] or 1.0
        price = a["price"]
        if intent == "bias":
            h = a["htf_bias"]
            lines.append(t["bias"].format(sym=sym, tf=tf, trend=w[a["trend"]], htf=a["htf"], htf_verdict=w.get(h["verdict"], h["verdict"]), htf_score=h["score"]))
            lines += [f"• {d}" for d in h["details"]]
            for b in a["breaks"][-3:]:
                lines.append(f"• {b['kind']} {w[b['direction']]} @ {fmt(b['level'])}")
            ind = a["indicators"]
            lines.append(f"• EMA21 {fmt(ind['ema21'])} / EMA50 {fmt(ind['ema50'])} / EMA200 {fmt(ind['ema200'])}; RSI {ind['rsi']:.1f}; ADX {ind['adx']:.1f}" if ind["rsi"] and ind["adx"] else "")
            evidence["htf_bias"] = h
        elif intent == "resistance":
            z = a["nearest_resistance"]
            if z:
                lines.append(t["res"].format(tf=tf, bot=fmt(z["bottom"]), top=fmt(z["top"]), touches=z["touches"], dist=(z["bottom"] - price) / atr, price=fmt(price)))
            else:
                liq = sorted([x for x in a["liquidity"] if x["side"] == "BSL" and x["price"] > price], key=lambda x: x["price"])
                lines.append(t["no_res"].format(liq=fmt(liq[0]["price"]) if liq else "—"))
            evidence["zone"] = z
            actions.append({"type": "highlight", "kinds": ["sr_zone", "liquidity"]})
        elif intent == "support":
            z = a["nearest_support"]
            if z:
                lines.append(t["sup"].format(tf=tf, bot=fmt(z["bottom"]), top=fmt(z["top"]), touches=z["touches"], dist=(price - z["top"]) / atr, price=fmt(price)))
            else:
                liq = sorted([x for x in a["liquidity"] if x["side"] == "SSL" and x["price"] < price], key=lambda x: -x["price"])
                lines.append(t["no_sup"].format(liq=fmt(liq[0]["price"]) if liq else "—"))
            evidence["zone"] = z
            actions.append({"type": "highlight", "kinds": ["sr_zone", "liquidity"]})
        elif intent == "sweep":
            sw = a["sweeps"]
            if sw:
                lines.append(t["sweeps"].format(tf=tf))
                for s in sw[-5:]:
                    side = "SSL" if s["direction"] == "bullish" else "BSL"
                    lines.append(f"• {side} @ {fmt(s['level'])} — wick {s['wick_atr']:.2f}× ATR → {w[s['direction']]}")
            else:
                lines.append(t["no_sweeps"].format(tf=tf))
            evidence["sweeps"] = sw[-5:]
            actions.append({"type": "highlight", "kinds": ["liquidity_sweep", "liquidity"]})
        elif intent == "order_block":
            obs = a["order_blocks"]
            if obs:
                o = min(obs, key=lambda o: abs((o["top"] + o["bottom"]) / 2 - price))
                bull = o["direction"] == "bullish"
                lines.append(t["ob"].format(side=w[o["direction"]].title() if lang == "en" else w[o["direction"]],
                                            bot=fmt(o["bottom"]), top=fmt(o["top"]), kind=o["break_kind"], disp=o["displacement_atr"],
                                            fvg=" + FVG" if o["with_fvg"] else "", status="tested" if o["touched_idx"] < 10**12 else "untested",
                                            inv_side=w["below"] if bull else w["above"], inv=fmt(o["bottom"] if bull else o["top"])))
                evidence["order_block"] = o
            else:
                lines.append(t["no_ob"].format(tf=tf))
            actions.append({"type": "highlight", "kinds": ["order_block"]})
        else:
            d = a["drawings"]
            lines.append(t["draw"].format(n=sum(x["kind"] == "swing" for x in d), b=sum(x["kind"] == "structure_break" for x in d),
                                          o=sum(x["kind"] == "order_block" for x in d), f=sum(x["kind"] == "fvg" for x in d)))
            actions.append({"type": "highlight", "kinds": ["swing", "structure_break", "order_block", "fvg"]})
        if a["simulated_data"]:
            lines.append(t["sim"])

    elif intent == "rejected":
        s = setup_fn(sym, tf)
        lines.append(t["status"].format(sym=sym, tf=tf, status=w.get(s["status"], s["status"])))
        if s["missing"]:
            lines.append(t["missing"].format(m=", ".join(s["missing"])))
        if s["reasons_against"]:
            lines.append(t["against"])
            lines += [f"• {r}" for r in s["reasons_against"][:8]]
        evidence["setup"] = {k: s[k] for k in ("status", "quality", "missing", "bar_time")}

    elif intent == "news":
        evs, src = events_fn(sym)
        if evs:
            lines.append(t["news_hdr"].format(sym=sym, src=src))
            for e in evs:
                when = dt.datetime.fromtimestamp(e["time"], dt.timezone.utc).strftime("%a %H:%M UTC")
                lines.append(f"• {when} — {e['title']} [{e['importance']}]: {impact_fn(e, sym)}")
        else:
            lines.append(t["no_news"].format(sym=sym, src=src))
        evidence["events"] = evs

    elif intent == "losing_trade":
        p = journal_fn()
        if p:
            lines.append(t["loss"].format(side=p["side"], sym=p["symbol"], entry=fmt(p["entry_price"]), exit=fmt(p["exit_price"]),
                                          reason=p["close_reason"], pnl=f"{p['realized_pnl']:.2f}"))
            setup = p.get("setup") or {}
            if setup:
                lines.append(t["loss_setup"].format(status=setup.get("status"), q=setup.get("quality")))
                lines += [f"• {r}" for r in (setup.get("reasons_against") or [])[:6]]
            evidence["position"] = {k: p[k] for k in ("id", "symbol", "side", "entry_price", "exit_price", "realized_pnl", "close_reason")}
        else:
            lines.append(t["no_loss"])
    else:
        lines.append(t["help"])

    return {"answer": "\n".join(x for x in lines if x), "language": lang, "intent": intent,
            "evidence": evidence, "actions": actions, "grounded": True}
