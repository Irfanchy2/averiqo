"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Fetch JSON from the proxy; optional polling interval (ms). Data is keyed by path so a
 * stale response for a previous path is never shown. */
export function useApi<T>(path: string | null, intervalMs?: number) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({ path: null, data: null, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const run = () =>
      api.get<T>(path)
        .then((d) => alive && setState({ path, data: d, error: null }))
        .catch((e: Error) => alive && setState((s) => ({ path, data: s.path === path ? s.data : null, error: e.message })));
    run();
    const id = intervalMs ? setInterval(run, intervalMs) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [path, intervalMs, tick]);

  const fresh = state.path === path;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload };
}

export interface StreamBar {
  type: "bar";
  symbol: string;
  tf: string;
  bar: { time: number; open: number; high: number; low: number; close: number; volume: number };
  quote: { bid: number; ask: number; mid: number; spread: number; timestamp: number };
}

/** Explicit URL, else same host on port 8000 (local dev). */
function wsUrl(): string {
  if (process.env.NEXT_PUBLIC_QUANT_WS_URL) return process.env.NEXT_PUBLIC_QUANT_WS_URL;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:8000/ws`;
}

/**
 * Live bar/quote stream. Uses the quant WebSocket; if it can't be reached (e.g. only the web port
 * is exposed through a preview, tunnel or proxy), falls back to polling through the /api proxy.
 * Returns true while live data is flowing either way.
 */
export function useMarketStream(symbol: string, tf: string, onBar: (b: StreamBar) => void, onClosed?: () => void) {
  const cb = useRef(onBar);
  const cbClosed = useRef(onClosed);
  useEffect(() => {
    cb.current = onBar;
    cbClosed.current = onClosed;
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let everOpened = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval> | undefined;
    let lastClosed = 0;

    const startPolling = () => {
      if (poll) return;
      const tick = async () => {
        try {
          const [c, q] = await Promise.all([
            api.get<{ candles: StreamBar["bar"][] }>(`/candles?symbol=${symbol}&tf=${tf}&limit=10`),
            api.get<StreamBar["quote"]>(`/quote?symbol=${symbol}`),
          ]);
          if (stop || !c.candles.length) return;
          setConnected(true);
          cb.current({ type: "bar", symbol, tf, bar: c.candles[c.candles.length - 1], quote: q });
          const closed = c.candles.length > 1 ? c.candles[c.candles.length - 2].time : 0;
          if (lastClosed && closed !== lastClosed) cbClosed.current?.();
          lastClosed = closed;
        } catch {
          setConnected(false);
        }
      };
      tick();
      poll = setInterval(tick, 2000);
    };

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        startPolling();
        return;
      }
      ws.onopen = () => {
        everOpened = true;
        failures = 0;
        if (poll) { clearInterval(poll); poll = undefined; }
        setConnected(true);
        ws?.send(JSON.stringify({ subscribe: { symbol, tf } }));
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type === "bar" && m.symbol === symbol && m.tf === tf) cb.current(m);
        if (m.type === "bar_closed" && m.symbol === symbol && m.tf === tf) cbClosed.current?.();
        if (m.type === "notification") window.dispatchEvent(new CustomEvent("tp-notification", { detail: m }));
      };
      ws.onclose = () => {
        if (stop) return;
        failures += 1;
        if (!poll) setConnected(false);
        // never reached the socket (or it keeps dropping): keep data flowing via HTTP polling
        if (!everOpened || failures >= 2) startPolling();
        retry = setTimeout(connect, Math.min(30_000, 2000 * failures));
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      if (poll) clearInterval(poll);
      ws?.close();
    };
  }, [symbol, tf]);

  return connected;
}
