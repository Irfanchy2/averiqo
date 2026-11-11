export type Timeframe = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D";
export const TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1D"];

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }

export interface Drawing {
  id: string;
  kind: string;
  label: string;
  symbol: string;
  timeframe: string;
  price: number | null;
  top: number | null;
  bottom: number | null;
  time_start: number | null;
  time_end: number | null;
  points: { time: number; price: number }[] | null;
  direction: "bullish" | "bearish" | null;
  detected_at: number;
  reason: string;
  quality: number;
  invalidation: string;
  status: string;
  inferred: boolean;
  position?: "above" | "below";
  levels?: { ratio: number; price: number }[];
  role?: string;
}

export interface Layer { key: string; name: string; verdict: string; score: number; details: string[] }

export interface TradePlan {
  entry: number;
  entry_zone: [number, number];
  stop_loss: number;
  take_profits: number[];
  tp_sources: string[];
  risk_per_unit: number;
  rr: number[];
  rr_net_tp2: number;
  estimated_cost_per_unit: number;
  cost_in_r: number;
  invalidation: string;
  position_size?: { qty: number; risk_amount: number; notional: number; note: string | null };
}

export type SetupStatus = "bullish_setup" | "bearish_setup" | "neutral" | "wait_for_confirmation" | "no_trade";

export interface Setup {
  symbol: string;
  timeframe: string;
  htf: string;
  status: SetupStatus;
  direction: "long" | "short" | null;
  quality: number;
  price: number;
  atr: number;
  bar_time: number;
  missing: string[];
  entry_condition: string | null;
  plan: TradePlan | null;
  layers: Layer[];
  reasons_for: string[];
  reasons_against: string[];
  invalidation: string | null;
  confidence: {
    calibrated: boolean;
    historical_win_rate: number | null;
    historical_expectancy_r: number | null;
    sample_size: number;
    note: string;
    simulated_data: boolean;
  };
  news: { active: boolean; reason?: string; next_event?: NewsEvent | null };
  simulated_data: boolean;
}

export interface Analysis {
  symbol: string;
  timeframe: string;
  htf: string;
  price: number;
  trend: string;
  htf_bias: Layer;
  drawings: Drawing[];
  indicators: Record<string, number | null>;
  simulated_data: boolean;
  data_source: string;
}

export interface NewsEvent {
  id: string;
  title: string;
  category: string;
  country: string;
  currency_tags: string[];
  time: number;
  importance: "high" | "medium" | "low";
  source: string;
  is_simulated: boolean;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  impact?: Record<string, string>;
}

export interface Account {
  balance: number;
  equity: number;
  unrealized_pnl: number;
  daily_pnl: number;
  open_positions: number;
  exposure: number;
  exposure_pct: number | null;
  kill_switch: boolean;
  kill_switch_reason: string | null;
  mode: "analysis" | "paper" | "live";
  simulated_data: boolean;
  starting_balance: number;
}

export interface Position {
  id: number;
  symbol: string;
  side: "long" | "short";
  qty: number;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  close_reason: string | null;
  realized_pnl: number;
  unrealized_pnl: number | null;
  fees: number;
  r_multiple: number | null;
  notes: string | null;
  tags: string[];
  setup: Partial<Setup> | null;
}

export interface Order {
  id: number;
  client_order_id: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  status: string;
  reject_reasons: string[] | null;
  risk_checks: { name: string; passed: boolean; detail: string }[] | null;
  fill_price: number | null;
  fees: number;
  slippage: number;
  created_at: string;
}

export interface Instrument {
  symbol: string;
  name: string;
  asset_class: string;
  qty_step: number;
  min_qty: number;
  contract_size: number;
}
