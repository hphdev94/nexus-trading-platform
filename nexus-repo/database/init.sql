-- ============================================================
-- NEXUS TRADING PLATFORM — PostgreSQL Schema v2.1
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── USERS ───────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(255),
    role          VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('USER','ADMIN','MANAGER')),
    active        BOOLEAN DEFAULT TRUE,
    mfa_enabled   BOOLEAN DEFAULT FALSE,
    mfa_secret    VARCHAR(255),
    gdpr_consent  BOOLEAN DEFAULT FALSE,
    gdpr_at       TIMESTAMPTZ,
    terms_at      TIMESTAMPTZ,
    last_login    TIMESTAMPTZ,
    login_fails   INTEGER DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    avatar_url    VARCHAR(500),
    timezone      VARCHAR(100) DEFAULT 'UTC',
    currency      VARCHAR(10)  DEFAULT 'USD',
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ─── SESSIONS ────────────────────────────────────────────
CREATE TABLE sessions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user  ON sessions(user_id);

-- ─── MT5 ACCOUNTS ────────────────────────────────────────
CREATE TABLE mt5_accounts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label         VARCHAR(255) NOT NULL,
    login         VARCHAR(100) NOT NULL,
    server        VARCHAR(255) NOT NULL,
    broker        VARCHAR(255),
    account_type  VARCHAR(20) DEFAULT 'LIVE' CHECK (account_type IN ('LIVE','DEMO')),
    currency      VARCHAR(10) DEFAULT 'USD',
    leverage      INTEGER DEFAULT 100,
    balance       DECIMAL(20,2) DEFAULT 0,
    equity        DECIMAL(20,2) DEFAULT 0,
    margin        DECIMAL(20,2) DEFAULT 0,
    free_margin   DECIMAL(20,2) DEFAULT 0,
    margin_level  DECIMAL(10,2),
    connected     BOOLEAN DEFAULT FALSE,
    last_sync     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mt5_user ON mt5_accounts(user_id);

-- ─── MT5 BROKER SERVERS ──────────────────────────────────
CREATE TABLE mt5_broker_servers (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broker_name VARCHAR(255) NOT NULL,
    server_name VARCHAR(255) NOT NULL UNIQUE,
    server_host VARCHAR(500),
    server_port INTEGER DEFAULT 443,
    account_type VARCHAR(20) DEFAULT 'LIVE' CHECK (account_type IN ('LIVE','DEMO','BOTH')),
    country     VARCHAR(100),
    regulation  VARCHAR(255),
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_broker_name ON mt5_broker_servers USING gin(broker_name gin_trgm_ops);
CREATE INDEX idx_server_name ON mt5_broker_servers USING gin(server_name gin_trgm_ops);

-- ─── INSTRUMENTS ─────────────────────────────────────────
CREATE TABLE instruments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol      VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(255),
    category    VARCHAR(50) CHECK (category IN ('FOREX','METALS','INDICES','CRYPTO','ENERGY','STOCKS','BONDS')),
    base_ccy    VARCHAR(10),
    quote_ccy   VARCHAR(10),
    pip_size    DECIMAL(20,10),
    lot_size    INTEGER DEFAULT 100000,
    min_lot     DECIMAL(10,2) DEFAULT 0.01,
    max_lot     DECIMAL(10,5) DEFAULT 500,
    lot_step    DECIMAL(10,2) DEFAULT 0.01,
    margin_pct  DECIMAL(10,4) DEFAULT 1.0,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instruments_symbol   ON instruments(symbol);
CREATE INDEX idx_instruments_category ON instruments(category);

-- ─── TRADES ──────────────────────────────────────────────
CREATE TABLE trades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    symbol          VARCHAR(50) NOT NULL,
    direction       VARCHAR(5) NOT NULL CHECK (direction IN ('BUY','SELL')),
    lots            DECIMAL(15,2) NOT NULL,
    open_price      DECIMAL(20,8) NOT NULL,
    close_price     DECIMAL(20,8),
    stop_loss       DECIMAL(20,8),
    take_profit     DECIMAL(20,8),
    commission      DECIMAL(20,4) DEFAULT 0,
    swap            DECIMAL(20,4) DEFAULT 0,
    profit          DECIMAL(20,4),
    profit_pips     DECIMAL(15,4),
    open_time       TIMESTAMPTZ NOT NULL,
    close_time      TIMESTAMPTZ,
    duration_secs   INTEGER,
    status          VARCHAR(10) DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
    close_reason    VARCHAR(50), -- 'TP','SL','MANUAL','MARGIN'
    mt5_ticket      BIGINT,
    entry_accuracy  DECIMAL(5,2),
    exit_accuracy   DECIMAL(5,2),
    tags            TEXT[],
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_account   ON trades(account_id);
CREATE INDEX idx_trades_user      ON trades(user_id);
CREATE INDEX idx_trades_symbol    ON trades(symbol);
CREATE INDEX idx_trades_open_time ON trades(open_time DESC);
CREATE INDEX idx_trades_status    ON trades(status);

-- ─── DAILY SNAPSHOTS ─────────────────────────────────────
CREATE TABLE daily_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id      UUID NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
    snap_date       DATE NOT NULL,
    balance         DECIMAL(20,2),
    equity          DECIMAL(20,2),
    profit          DECIMAL(20,4),
    trades_count    INTEGER DEFAULT 0,
    win_count       INTEGER DEFAULT 0,
    loss_count      INTEGER DEFAULT 0,
    drawdown        DECIMAL(10,4),
    drawdown_pct    DECIMAL(10,4),
    UNIQUE(account_id, snap_date)
);

CREATE INDEX idx_snapshots_account ON daily_snapshots(account_id, snap_date DESC);

-- ─── COPY ACCOUNTS ───────────────────────────────────────
CREATE TABLE copy_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id       UUID REFERENCES mt5_accounts(id),
    label           VARCHAR(255) NOT NULL,
    server          VARCHAR(255),
    login           VARCHAR(100),
    risk_pct        DECIMAL(5,2) DEFAULT 100,
    max_lots        DECIMAL(10,2),
    reverse         BOOLEAN DEFAULT FALSE,
    active          BOOLEAN DEFAULT TRUE,
    connected       BOOLEAN DEFAULT FALSE,
    total_trades    INTEGER DEFAULT 0,
    total_profit    DECIMAL(20,4) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AUDIT LOG ───────────────────────────────────────────
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id),
    session_id  UUID,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    data        JSONB DEFAULT '{}',
    ip_address  INET,
    severity    VARCHAR(10) DEFAULT 'INFO' CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user    ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ─── AI CONVERSATIONS ────────────────────────────────────
CREATE TABLE ai_conversations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(500),
    messages    JSONB DEFAULT '[]',
    context     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id, created_at DESC);

-- ─── PRICE TICKS (partitioned) ───────────────────────────
CREATE TABLE price_ticks (
    id          BIGSERIAL,
    symbol      VARCHAR(50) NOT NULL,
    bid         DECIMAL(20,8) NOT NULL,
    ask         DECIMAL(20,8) NOT NULL,
    spread      DECIMAL(20,8),
    tick_time   TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (tick_time);

-- Create monthly partitions (current + 3 future)
CREATE TABLE price_ticks_2025_01 PARTITION OF price_ticks FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE price_ticks_2025_02 PARTITION OF price_ticks FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE price_ticks_2025_03 PARTITION OF price_ticks FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE price_ticks_2026_01 PARTITION OF price_ticks FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE price_ticks_2026_02 PARTITION OF price_ticks FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE price_ticks_2026_03 PARTITION OF price_ticks FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE price_ticks_2026_04 PARTITION OF price_ticks FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE price_ticks_2026_12 PARTITION OF price_ticks FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE price_ticks_default PARTITION OF price_ticks DEFAULT;

CREATE INDEX idx_ticks_symbol_time ON price_ticks(symbol, tick_time DESC);

-- ─── NOTIFICATIONS ───────────────────────────────────────
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(50),
    title       VARCHAR(255),
    body        TEXT,
    data        JSONB DEFAULT '{}',
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

-- ─── FUNCTIONS ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_mt5_updated_at   BEFORE UPDATE ON mt5_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ANALYTICS VIEWS ─────────────────────────────────────
CREATE OR REPLACE VIEW trade_analytics AS
SELECT
    t.account_id,
    t.user_id,
    t.symbol,
    COUNT(*)                                                            AS total_trades,
    COUNT(*) FILTER (WHERE t.profit > 0)                               AS wins,
    COUNT(*) FILTER (WHERE t.profit <= 0)                              AS losses,
    ROUND(COUNT(*) FILTER (WHERE t.profit > 0) * 100.0 / NULLIF(COUNT(*),0), 2) AS win_rate_pct,
    ROUND(SUM(t.profit), 2)                                            AS total_profit,
    ROUND(AVG(t.profit) FILTER (WHERE t.profit > 0), 2)               AS avg_win,
    ROUND(AVG(t.profit) FILTER (WHERE t.profit <= 0), 2)              AS avg_loss,
    ROUND(ABS(AVG(t.profit) FILTER (WHERE t.profit > 0)) /
          NULLIF(ABS(AVG(t.profit) FILTER (WHERE t.profit <= 0)),0), 2) AS profit_factor,
    MAX(t.profit)                                                       AS best_trade,
    MIN(t.profit)                                                       AS worst_trade,
    MAX(t.duration_secs) FILTER (WHERE t.profit > 0)                  AS longest_win_secs,
    MIN(t.duration_secs) FILTER (WHERE t.profit > 0)                  AS shortest_win_secs,
    MAX(t.duration_secs) FILTER (WHERE t.profit <= 0)                 AS longest_loss_secs,
    MIN(t.duration_secs) FILTER (WHERE t.profit <= 0)                 AS shortest_loss_secs,
    ROUND(AVG(t.entry_accuracy), 2)                                    AS avg_entry_accuracy,
    ROUND(AVG(t.exit_accuracy), 2)                                     AS avg_exit_accuracy,
    ROUND(AVG(t.lots), 2)                                              AS avg_lots,
    ROUND(SUM(t.commission), 2)                                        AS total_commission,
    ROUND(SUM(t.swap), 2)                                              AS total_swap
FROM trades t
WHERE t.status = 'CLOSED'
GROUP BY t.account_id, t.user_id, t.symbol;

-- ─── SEED DATA — MT5 BROKER SERVERS ──────────────────────
INSERT INTO mt5_broker_servers (broker_name, server_name, server_host, account_type, country, regulation) VALUES
-- IC Markets
('IC Markets', 'ICMarketsSC-Demo',     'demo.icmarkets.com:443',      'DEMO', 'Seychelles', 'FSA'),
('IC Markets', 'ICMarketsSC-MT5-1',   'mt5.icmarkets.com:443',       'LIVE', 'Seychelles', 'FSA'),
('IC Markets', 'ICMarkets-MT5',       'icmt5.icmarkets.com:443',     'LIVE', 'Australia',  'ASIC'),
-- Pepperstone
('Pepperstone', 'Pepperstone-Demo',    'demo-au02.pepperstone.com',   'DEMO', 'Australia',  'ASIC/FCA'),
('Pepperstone', 'Pepperstone-Edge-1',  'edge1.pepperstone.com:443',   'LIVE', 'Australia',  'ASIC/FCA'),
('Pepperstone', 'Pepperstone-Edge-2',  'edge2.pepperstone.com:443',   'LIVE', 'UK',         'FCA'),
-- Exness
('Exness', 'Exness-Trial',             'trial.exness.com:443',        'DEMO', 'Cyprus',     'CySEC/FCA'),
('Exness', 'Exness-MT5Real5',          'mt5real5.exness.com:443',     'LIVE', 'Cyprus',     'CySEC/FCA'),
('Exness', 'Exness-MT5Real6',          'mt5real6.exness.com:443',     'LIVE', 'Cyprus',     'CySEC/FCA'),
('Exness', 'Exness-MT5Real7',          'mt5real7.exness.com:443',     'LIVE', 'Cyprus',     'CySEC/FCA'),
-- XM
('XM', 'XMGlobal-Demo',               'mt5demo.xm.com:443',          'DEMO', 'Belize',     'IFSC'),
('XM', 'XMGlobal-MT5 3',              'mt5real3.xm.com:443',         'LIVE', 'Belize',     'IFSC'),
('XM', 'XMGlobal-MT5 4',              'mt5real4.xm.com:443',         'LIVE', 'Belize',     'IFSC'),
-- FXCM
('FXCM', 'FXCM-USDDemo01',            'usdemo1.fxcorporate.com:443', 'DEMO', 'UK',         'FCA'),
('FXCM', 'FXCM-USDReal01',            'usreal1.fxcorporate.com:443', 'LIVE', 'UK',         'FCA'),
-- FP Markets
('FP Markets', 'FPMarkets-Demo',       'mt5demo.fpmarkets.com:443',   'DEMO', 'Australia',  'ASIC'),
('FP Markets', 'FPMarkets-MT5-2',      'mt5real2.fpmarkets.com:443',  'LIVE', 'Australia',  'ASIC'),
-- Axiory
('Axiory', 'Axiory-Demo',              'demo.axiory.com:443',         'DEMO', 'Belize',     'IFSC'),
('Axiory', 'Axiory-Real',              'live.axiory.com:443',         'LIVE', 'Belize',     'IFSC'),
-- OANDA
('OANDA', 'OANDA-fxTrade Practice',   'mt5practiceapi.oanda.com',    'DEMO', 'USA',        'CFTC/NFA'),
('OANDA', 'OANDA-fxTrade',            'mt5api.oanda.com:443',        'LIVE', 'USA',        'CFTC/NFA'),
-- IG Markets
('IG', 'IG-DemoUK',                   'igdemofs.ig.com:443',         'DEMO', 'UK',         'FCA'),
('IG', 'IG-LiveUK',                   'iglivefs.ig.com:443',         'LIVE', 'UK',         'FCA'),
-- Tickmill
('Tickmill', 'Tickmill-Demo',          'demo.tickmill.com:443',       'DEMO', 'UK',         'FCA'),
('Tickmill', 'Tickmill-Live',          'live.tickmill.com:443',       'LIVE', 'UK',         'FCA'),
-- HotForex
('HotForex', 'HFMarkets-Demo',         'demo.hotforex.com:443',       'DEMO', 'SVG',        'CySEC'),
('HotForex', 'HFMarkets-Live3',        'live3.hotforex.com:443',      'LIVE', 'SVG',        'CySEC'),
-- Admiral Markets
('Admirals', 'Admirals-Demo',          'demo.admiralmarkets.com:443', 'DEMO', 'Estonia',    'CySEC/FCA'),
('Admirals', 'Admirals-Live',          'live.admiralmarkets.com:443', 'LIVE', 'Estonia',    'CySEC/FCA'),
-- FXPRO
('FxPro', 'FxPro.com-Demo37',          'demo37.fxpro.com:443',        'DEMO', 'UK',         'FCA'),
('FxPro', 'FxPro.com-Real37',          'real37.fxpro.com:443',        'LIVE', 'UK',         'FCA'),
-- FXTM
('FXTM', 'FXTM-Demo',                  'demo.forextime.com:443',      'DEMO', 'Cyprus',     'CySEC'),
('FXTM', 'FXTM-MT5 Real 3',            'real3.forextime.com:443',     'LIVE', 'Cyprus',     'CySEC'),
-- Vantage
('Vantage', 'Vantage-Demo',            'demo.vantagemarkets.com:443', 'DEMO', 'Australia',  'ASIC'),
('Vantage', 'Vantage-Real',            'live.vantagemarkets.com:443', 'LIVE', 'Australia',  'ASIC'),
-- EightCap
('EightCap', 'EightCap-Demo',          'demo.eightcap.com:443',       'DEMO', 'Australia',  'ASIC'),
('EightCap', 'EightCap-Live',          'live.eightcap.com:443',       'LIVE', 'Australia',  'ASIC'),
-- Fusion Markets
('Fusion Markets', 'Fusion-Demo',      'demo.fusionmarkets.com:443',  'DEMO', 'Australia',  'ASIC'),
('Fusion Markets', 'Fusion-Real',      'live.fusionmarkets.com:443',  'LIVE', 'Australia',  'ASIC'),
-- Axi
('Axi', 'Axi-Demo',                    'demo.axi.com:443',            'DEMO', 'Australia',  'ASIC'),
('Axi', 'Axi-Live',                    'live.axi.com:443',            'LIVE', 'Australia',  'ASIC'),
-- BlackBull
('BlackBull', 'BlackBull-Demo',        'demo.blackbullmarkets.com',   'DEMO', 'New Zealand','FMA'),
('BlackBull', 'BlackBull-Prime',       'live.blackbullmarkets.com',   'LIVE', 'New Zealand','FMA'),
-- NAGA
('NAGA', 'NAGA-Demo',                  'demo.naga.com:443',           'DEMO', 'Cyprus',     'CySEC'),
('NAGA', 'NAGA-Real',                  'live.naga.com:443',           'LIVE', 'Cyprus',     'CySEC'),
-- Darwinex
('Darwinex', 'Darwinex-Demo',          'demo.darwinex.com:443',       'DEMO', 'UK',         'FCA'),
('Darwinex', 'Darwinex-Live',          'live.darwinex.com:443',       'LIVE', 'UK',         'FCA'),
-- Coinexx
('Coinexx', 'Coinexx-Demo',            'demo.coinexx.com:443',        'DEMO', 'SVG',        'SVG FSA'),
('Coinexx', 'Coinexx-Real',            'live.coinexx.com:443',        'LIVE', 'SVG',        'SVG FSA'),
-- Valutrades
('Valutrades', 'Valutrades-Demo',      'demo.valutrades.com:443',     'DEMO', 'UK',         'FCA'),
('Valutrades', 'Valutrades-Live',      'live.valutrades.com:443',     'LIVE', 'UK',         'FCA'),
-- ThinkMarkets
('ThinkMarkets', 'ThinkMarkets-Demo',  'demo.thinkmarkets.com:443',   'DEMO', 'UK',         'FCA'),
('ThinkMarkets', 'ThinkMarkets-Live',  'live.thinkmarkets.com:443',   'LIVE', 'UK',         'FCA');

-- ─── SEED INSTRUMENTS ────────────────────────────────────
INSERT INTO instruments (symbol, name, category, base_ccy, quote_ccy, pip_size, lot_size, min_lot, max_lot) VALUES
-- Forex Majors
('EURUSD','Euro/US Dollar',              'FOREX','EUR','USD',0.00001,100000,0.01,500),
('GBPUSD','GBP/US Dollar',              'FOREX','GBP','USD',0.00001,100000,0.01,500),
('USDJPY','US Dollar/Japanese Yen',     'FOREX','USD','JPY',0.001,  100000,0.01,500),
('USDCHF','US Dollar/Swiss Franc',      'FOREX','USD','CHF',0.00001,100000,0.01,500),
('AUDUSD','Australian Dollar/USD',      'FOREX','AUD','USD',0.00001,100000,0.01,500),
('USDCAD','US Dollar/Canadian Dollar',  'FOREX','USD','CAD',0.00001,100000,0.01,500),
('NZDUSD','New Zealand Dollar/USD',     'FOREX','NZD','USD',0.00001,100000,0.01,500),
-- Forex Minors
('EURGBP','Euro/GBP',                   'FOREX','EUR','GBP',0.00001,100000,0.01,500),
('EURJPY','Euro/Japanese Yen',          'FOREX','EUR','JPY',0.001,  100000,0.01,500),
('GBPJPY','GBP/Japanese Yen',           'FOREX','GBP','JPY',0.001,  100000,0.01,500),
('EURCHF','Euro/Swiss Franc',           'FOREX','EUR','CHF',0.00001,100000,0.01,500),
('GBPCHF','GBP/Swiss Franc',            'FOREX','GBP','CHF',0.00001,100000,0.01,500),
('EURCAD','Euro/Canadian Dollar',       'FOREX','EUR','CAD',0.00001,100000,0.01,500),
('GBPCAD','GBP/Canadian Dollar',        'FOREX','GBP','CAD',0.00001,100000,0.01,500),
('AUDCAD','AUD/Canadian Dollar',        'FOREX','AUD','CAD',0.00001,100000,0.01,500),
('AUDCHF','AUD/Swiss Franc',            'FOREX','AUD','CHF',0.00001,100000,0.01,500),
('AUDJPY','AUD/Japanese Yen',           'FOREX','AUD','JPY',0.001,  100000,0.01,500),
('CADJPY','Canadian Dollar/JPY',        'FOREX','CAD','JPY',0.001,  100000,0.01,500),
('CHFJPY','Swiss Franc/JPY',            'FOREX','CHF','JPY',0.001,  100000,0.01,500),
('NZDJPY','NZD/JPY',                    'FOREX','NZD','JPY',0.001,  100000,0.01,500),
('NZDCAD','NZD/Canadian Dollar',        'FOREX','NZD','CAD',0.00001,100000,0.01,500),
('NZDCHF','NZD/Swiss Franc',            'FOREX','NZD','CHF',0.00001,100000,0.01,500),
('GBPAUD','GBP/Australian Dollar',      'FOREX','GBP','AUD',0.00001,100000,0.01,500),
('EURAUD','Euro/Australian Dollar',     'FOREX','EUR','AUD',0.00001,100000,0.01,500),
-- Metals
('XAUUSD','Gold/US Dollar',             'METALS','XAU','USD',0.01,  100,   0.01,50),
('XAGUSD','Silver/US Dollar',           'METALS','XAG','USD',0.001, 5000,  0.01,50),
('XPTUSD','Platinum/US Dollar',         'METALS','XPT','USD',0.01,  100,   0.01,10),
('XPDUSD','Palladium/US Dollar',        'METALS','XPD','USD',0.01,  100,   0.01,10),
-- Indices
('US30',  'Dow Jones 30',               'INDICES',NULL,'USD',1,     1,     0.01,50),
('NAS100','NASDAQ 100',                 'INDICES',NULL,'USD',1,     1,     0.01,50),
('SPX500','S&P 500',                    'INDICES',NULL,'USD',0.1,   1,     0.01,50),
('UK100', 'FTSE 100',                   'INDICES',NULL,'GBP',1,     1,     0.01,50),
('GER40', 'DAX 40',                     'INDICES',NULL,'EUR',1,     1,     0.01,50),
('FRA40', 'CAC 40',                     'INDICES',NULL,'EUR',1,     1,     0.01,50),
('JPN225','Nikkei 225',                 'INDICES',NULL,'JPY',1,     1,     0.01,50),
('AUS200','ASX 200',                    'INDICES',NULL,'AUD',1,     1,     0.01,50),
('HK50',  'Hang Seng 50',               'INDICES',NULL,'HKD',1,     1,     0.01,50),
('EUSTX50','Euro Stoxx 50',             'INDICES',NULL,'EUR',1,     1,     0.01,50),
-- Crypto
('BTCUSD','Bitcoin/US Dollar',          'CRYPTO','BTC','USD',1,     1,     0.01,10),
('ETHUSD','Ethereum/US Dollar',         'CRYPTO','ETH','USD',0.1,   1,     0.01,20),
('LTCUSD','Litecoin/US Dollar',         'CRYPTO','LTC','USD',0.01,  1,     0.01,50),
('XRPUSD','XRP/US Dollar',              'CRYPTO','XRP','USD',0.0001,1,     0.01,50),
('BNBUSD','Binance Coin/USD',           'CRYPTO','BNB','USD',0.01,  1,     0.01,50),
('SOLUSD','Solana/US Dollar',           'CRYPTO','SOL','USD',0.01,  1,     0.01,50),
('ADAUSD','Cardano/US Dollar',          'CRYPTO','ADA','USD',0.0001,1,     0.01,50),
('DOGUSD','Dogecoin/USD',               'CRYPTO','DOGE','USD',0.00001,1,   0.01,50),
-- Energy
('USOIL', 'WTI Crude Oil',              'ENERGY',NULL,'USD',0.01,   1000,  0.01,50),
('UKOIL', 'Brent Crude Oil',            'ENERGY',NULL,'USD',0.01,   1000,  0.01,50),
('NATGAS','Natural Gas',                'ENERGY',NULL,'USD',0.001,  10000, 0.01,50);

-- ─── DEFAULT ADMIN USER ───────────────────────────────────
INSERT INTO users (email, password_hash, name, role, gdpr_consent, gdpr_at, terms_at, active)
VALUES (
    'admin@nexus.com',
    crypt('Admin123!', gen_salt('bf', 12)),
    'Platform Admin',
    'ADMIN',
    TRUE,
    NOW(),
    NOW(),
    TRUE
);

-- ─── ANALYTICS HELPER FUNCTION ───────────────────────────
CREATE OR REPLACE FUNCTION get_drawdown_series(p_account_id UUID)
RETURNS TABLE(snap_date DATE, equity DECIMAL, drawdown_pct DECIMAL, running_max DECIMAL) AS $$
DECLARE
    peak DECIMAL := 0;
BEGIN
    FOR snap_date, equity IN
        SELECT s.snap_date, s.equity FROM daily_snapshots s
        WHERE s.account_id = p_account_id ORDER BY s.snap_date
    LOOP
        IF equity > peak THEN peak := equity; END IF;
        drawdown_pct := CASE WHEN peak > 0 THEN ((peak - equity) / peak) * 100 ELSE 0 END;
        running_max  := peak;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─── SESSION CLEANUP ─────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
