-- TradePilot AI — PostgreSQL schema (generated from app/db/models.py; keep in sync).
-- Apply: psql "$DATABASE_URL" -f infra/db/schema.sql  (the service also auto-creates tables on start).

CREATE TABLE audit_log (
	id SERIAL NOT NULL, 
	ts TIMESTAMP WITH TIME ZONE NOT NULL, 
	actor VARCHAR(64) NOT NULL, 
	action VARCHAR(64) NOT NULL, 
	payload JSON NOT NULL, 
	prev_hash VARCHAR(64) NOT NULL, 
	hash VARCHAR(64) NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_audit_log_ts ON audit_log (ts);
CREATE INDEX ix_audit_log_action ON audit_log (action);

CREATE TABLE backtest_runs (
	id SERIAL NOT NULL, 
	symbol VARCHAR(32) NOT NULL, 
	timeframe VARCHAR(8) NOT NULL, 
	params JSON NOT NULL, 
	metrics JSON NOT NULL, 
	data_source VARCHAR(32) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE signals (
	id SERIAL NOT NULL, 
	symbol VARCHAR(32) NOT NULL, 
	timeframe VARCHAR(8) NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	direction VARCHAR(8), 
	quality INTEGER NOT NULL, 
	bar_time INTEGER NOT NULL, 
	payload JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_signal_bar UNIQUE (symbol, timeframe, bar_time)
);
CREATE INDEX ix_signals_symbol ON signals (symbol);

CREATE TABLE users (
	id SERIAL NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE broker_credentials (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	broker VARCHAR(32) NOT NULL, 
	label VARCHAR(64) NOT NULL, 
	ciphertext TEXT NOT NULL, 
	key_fingerprint VARCHAR(16) NOT NULL, 
	declared_permissions JSON NOT NULL, 
	verified BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE paper_accounts (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	currency VARCHAR(8) NOT NULL, 
	starting_balance FLOAT NOT NULL, 
	balance FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE trading_settings (
	user_id INTEGER NOT NULL, 
	mode VARCHAR(16) NOT NULL, 
	live_opt_in_at TIMESTAMP WITH TIME ZONE, 
	kill_switch BOOLEAN NOT NULL, 
	kill_switch_reason VARCHAR(255), 
	risk_config JSON NOT NULL, 
	strategy_params JSON NOT NULL, 
	preferences JSON NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE TABLE orders (
	id SERIAL NOT NULL, 
	account_id INTEGER NOT NULL, 
	client_order_id VARCHAR(64) NOT NULL, 
	mode VARCHAR(16) NOT NULL, 
	symbol VARCHAR(32) NOT NULL, 
	side VARCHAR(4) NOT NULL, 
	type VARCHAR(8) NOT NULL, 
	qty FLOAT NOT NULL, 
	limit_price FLOAT, 
	stop_price FLOAT, 
	stop_loss FLOAT, 
	take_profit FLOAT, 
	status VARCHAR(16) NOT NULL, 
	reject_reasons JSON, 
	risk_checks JSON, 
	fill_price FLOAT, 
	fees FLOAT NOT NULL, 
	slippage FLOAT NOT NULL, 
	latency_ms INTEGER, 
	position_id INTEGER, 
	setup JSON, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	filled_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_order_client_id UNIQUE (account_id, client_order_id), 
	FOREIGN KEY(account_id) REFERENCES paper_accounts (id)
);
CREATE INDEX ix_orders_account_id ON orders (account_id);

CREATE TABLE positions (
	id SERIAL NOT NULL, 
	account_id INTEGER NOT NULL, 
	symbol VARCHAR(32) NOT NULL, 
	side VARCHAR(5) NOT NULL, 
	qty FLOAT NOT NULL, 
	entry_price FLOAT NOT NULL, 
	stop_loss FLOAT, 
	take_profit FLOAT, 
	status VARCHAR(8) NOT NULL, 
	opened_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	closed_at TIMESTAMP WITH TIME ZONE, 
	exit_price FLOAT, 
	close_reason VARCHAR(32), 
	realized_pnl FLOAT NOT NULL, 
	fees FLOAT NOT NULL, 
	initial_risk FLOAT, 
	setup JSON, 
	notes TEXT, 
	tags JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(account_id) REFERENCES paper_accounts (id)
);
CREATE INDEX ix_positions_account_id ON positions (account_id);

-- Audit log is append-only: revoke UPDATE/DELETE from the application role in production:
-- REVOKE UPDATE, DELETE ON audit_log FROM tradepilot_app;
