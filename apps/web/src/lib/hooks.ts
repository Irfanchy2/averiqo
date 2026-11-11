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

const WS_URL = process.env.NEXT_PUBLIC_QUANT_WS_URL ?? "ws://localhost:8000/ws";

/** Live bar/quote stream with automatic reconnect. */
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
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
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
        setConnected(false);
        if (!stop) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [symbol, tf]);

  return connected;
}
