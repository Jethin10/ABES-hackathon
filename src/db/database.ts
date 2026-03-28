import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Pool } from 'pg';

export type DatabaseEngine = 'sqlite' | 'postgres';
type SqlValue = string | number | null;

const sqliteSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  founder_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  goal_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  funding_mode TEXT NOT NULL,
  funding_deadline TEXT NOT NULL,
  total_raised REAL NOT NULL DEFAULT 0,
  backer_count INTEGER NOT NULL DEFAULT 0,
  escrow_reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (founder_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  percentage REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  proof_manifest_cid TEXT,
  proof_notes TEXT,
  vote_opens_at TEXT,
  vote_closes_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  payout_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (campaign_id, position),
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  backer_id TEXT NOT NULL,
  amount REAL NOT NULL,
  asset_type TEXT NOT NULL,
  payment_source TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (backer_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL,
  backer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (milestone_id, backer_id),
  FOREIGN KEY (milestone_id) REFERENCES milestones (id) ON DELETE CASCADE,
  FOREIGN KEY (backer_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS arbitration_votes (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL,
  validator_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (milestone_id, validator_id),
  FOREIGN KEY (milestone_id) REFERENCES milestones (id) ON DELETE CASCADE,
  FOREIGN KEY (validator_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  gross_amount REAL NOT NULL,
  buffer_amount REAL NOT NULL,
  status TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES milestones (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escrow_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  milestone_id TEXT,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES milestones (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_verifications (
  user_id TEXT PRIMARY KEY,
  kyc_status TEXT NOT NULL,
  wallet_address TEXT,
  payout_address TEXT,
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS treasury_state (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  buffer_balance REAL NOT NULL,
  yield_balance REAL NOT NULL,
  reserve_balance REAL NOT NULL,
  total_contributions REAL NOT NULL,
  total_payouts REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_cursors (
  key TEXT PRIMARY KEY,
  cursor_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_finance_profiles (
  campaign_id TEXT PRIMARY KEY,
  funding_rail TEXT NOT NULL,
  compliance_region TEXT NOT NULL,
  payment_provider TEXT NOT NULL,
  escrow_model TEXT NOT NULL,
  yield_strategy TEXT NOT NULL,
  liquidity_buffer_ratio REAL NOT NULL,
  yield_deployment_ratio REAL NOT NULL,
  token_model TEXT NOT NULL,
  bank_partner TEXT,
  defi_protocols TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS treasury_pools (
  rail TEXT PRIMARY KEY,
  buffer_balance REAL NOT NULL,
  yield_balance REAL NOT NULL,
  reserve_balance REAL NOT NULL,
  total_contributions REAL NOT NULL,
  total_payouts REAL NOT NULL,
  last_rebalance_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, provider_user_id),
  UNIQUE (provider, provider_email),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
`;

const postgresSchema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  founder_id TEXT NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  goal_amount NUMERIC(18, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  funding_mode TEXT NOT NULL,
  funding_deadline TIMESTAMPTZ NOT NULL,
  total_raised NUMERIC(18, 2) NOT NULL DEFAULT 0,
  backer_count INTEGER NOT NULL DEFAULT 0,
  escrow_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  percentage NUMERIC(10, 4) NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL,
  proof_manifest_cid TEXT,
  proof_notes TEXT,
  vote_opens_at TIMESTAMPTZ,
  vote_closes_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  payout_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_id, position)
);

CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  backer_id TEXT NOT NULL REFERENCES users(id),
  amount NUMERIC(18, 2) NOT NULL,
  asset_type TEXT NOT NULL,
  payment_source TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  backer_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  weight NUMERIC(18, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (milestone_id, backer_id)
);

CREATE TABLE IF NOT EXISTS arbitration_votes (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  validator_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (milestone_id, validator_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  gross_amount NUMERIC(18, 2) NOT NULL,
  buffer_amount NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL,
  transaction_reference TEXT NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS escrow_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kyc_status TEXT NOT NULL,
  wallet_address TEXT,
  payout_address TEXT,
  notes TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_state (
  id TEXT PRIMARY KEY,
  buffer_balance NUMERIC(18, 2) NOT NULL,
  yield_balance NUMERIC(18, 2) NOT NULL,
  reserve_balance NUMERIC(18, 2) NOT NULL,
  total_contributions NUMERIC(18, 2) NOT NULL,
  total_payouts NUMERIC(18, 2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_cursors (
  key TEXT PRIMARY KEY,
  cursor_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_finance_profiles (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  funding_rail TEXT NOT NULL,
  compliance_region TEXT NOT NULL,
  payment_provider TEXT NOT NULL,
  escrow_model TEXT NOT NULL,
  yield_strategy TEXT NOT NULL,
  liquidity_buffer_ratio NUMERIC(10, 4) NOT NULL,
  yield_deployment_ratio NUMERIC(10, 4) NOT NULL,
  token_model TEXT NOT NULL,
  bank_partner TEXT,
  defi_protocols JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS treasury_pools (
  rail TEXT PRIMARY KEY,
  buffer_balance NUMERIC(18, 2) NOT NULL,
  yield_balance NUMERIC(18, 2) NOT NULL,
  reserve_balance NUMERIC(18, 2) NOT NULL,
  total_contributions NUMERIC(18, 2) NOT NULL,
  total_payouts NUMERIC(18, 2) NOT NULL,
  last_rebalance_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS social_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_user_id),
  UNIQUE (provider, provider_email)
);
`;

const normalizeRow = <T>(row: Record<string, unknown> | undefined): T | undefined => {
  if (!row) {
    return undefined;
  }

  const converted = Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
        return [key, Number(value)];
      }

      return [key, value];
    })
  );

  return converted as T;
};

export interface DatabaseClient {
  init(): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

class SqliteDatabaseClient implements DatabaseClient {
  private db: DatabaseSync | null = null;

  constructor(private readonly databasePath: string) {}

  async init() {
    if (this.db) {
      return;
    }

    const resolvedPath = resolve(this.databasePath);
    const directory = dirname(resolvedPath);

    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    this.db = new DatabaseSync(resolvedPath);
    this.db.exec(sqliteSchema);
  }

  async run(sql: string, params: SqlValue[] = []) {
    this.assertDb().prepare(sql).run(...params);
  }

  async get<T>(sql: string, params: SqlValue[] = []) {
    return this.assertDb().prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, params: SqlValue[] = []) {
    return this.assertDb().prepare(sql).all(...params) as T[];
  }

  async exec(sql: string) {
    this.assertDb().exec(sql);
  }

  async close() {
    this.db?.close();
    this.db = null;
  }

  private assertDb() {
    if (!this.db) {
      throw new Error('SQLite database has not been initialized.');
    }

    return this.db;
  }
}

class PostgresDatabaseClient implements DatabaseClient {
  private initialized = false;

  constructor(private readonly pool: Pool) {}

  async init() {
    if (this.initialized) {
      return;
    }

    await this.pool.query(postgresSchema);
    this.initialized = true;
  }

  async run(sql: string, params: SqlValue[] = []) {
    const query = translateSql(sql);
    await this.pool.query(query.text, query.values(params));
  }

  async get<T>(sql: string, params: SqlValue[] = []) {
    const query = translateSql(sql);
    const result = await this.pool.query(query.text, query.values(params));
    return normalizeRow<T>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async all<T>(sql: string, params: SqlValue[] = []) {
    const query = translateSql(sql);
    const result = await this.pool.query(query.text, query.values(params));
    return result.rows.map((row) => normalizeRow<T>(row as Record<string, unknown>) as T);
  }

  async exec(sql: string) {
    await this.pool.query(sql);
  }

  async close() {
    await this.pool.end();
  }
}

const translateSql = (sql: string) => {
  let index = 0;
  return {
    text: sql.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    }),
    values: (params: SqlValue[]) => params
  };
};

export const createDatabaseClient = (input: {
  engine: DatabaseEngine;
  databasePath: string;
  databaseUrl?: string;
}) => {
  if (input.engine === 'postgres') {
    if (!input.databaseUrl) {
      throw new Error('DATABASE_URL is required when DATABASE_ENGINE=postgres.');
    }

    return new PostgresDatabaseClient(
      new Pool({
        connectionString: input.databaseUrl,
        ssl: input.databaseUrl.includes('sslmode=')
          ? { rejectUnauthorized: false }
          : undefined
      })
    );
  }

  return new SqliteDatabaseClient(input.databasePath);
};
