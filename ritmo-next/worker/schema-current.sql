PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_norm TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_key TEXT,
  data_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS incomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id,date DESC);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_due ON expenses(user_id,due_date);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creditor TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
  start_date TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','quitada')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS debt_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pagamento','haver')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  cash_received INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_debt_events_debt ON debt_events(user_id,debt_id,date DESC);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK(target_amount > 0),
  deadline TEXT,
  category TEXT NOT NULL DEFAULT 'Personalizado',
  is_emergency INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal ON goal_contributions(user_id,goal_id,date DESC);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  notify_due INTEGER NOT NULL DEFAULT 1,
  notify_overdue INTEGER NOT NULL DEFAULT 1,
  notify_goals INTEGER NOT NULL DEFAULT 1,
  reminder_days INTEGER NOT NULL DEFAULT 3,
  monthly_summary INTEGER NOT NULL DEFAULT 1,
  auto_lock_minutes INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id,created_at DESC);


CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id,created_at DESC);


CREATE TABLE IF NOT EXISTS user_mobile_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mobile_shortcuts TEXT NOT NULL DEFAULT '["expenses","debts","goals"]',
  seen_notifications TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Ritmo a dois: vínculo seguro entre exatamente duas contas.
CREATE TABLE IF NOT EXISTS partnerships (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partnership_members (
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(partnership_id,user_id),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_partnership_member_user ON partnership_members(user_id);

CREATE TABLE IF NOT EXISTS partnership_invites (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partnership_invitee ON partnership_invites(invitee_user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_partnership_outgoing ON partnership_invites(partnership_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS user_workspace_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  view_scope TEXT NOT NULL DEFAULT 'personal' CHECK(view_scope IN ('personal','shared')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shared_incomes (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_incomes_date ON shared_incomes(partnership_id,date DESC);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  amount INTEGER NOT NULL CHECK(amount >= 0),
  date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'Nenhuma',
  origin TEXT NOT NULL DEFAULT 'manual',
  debt_id TEXT,
  debt_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_date ON shared_expenses(partnership_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_due ON shared_expenses(partnership_id,due_date);

CREATE TABLE IF NOT EXISTS shared_debts (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  creditor TEXT NOT NULL,
  total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
  start_date TEXT NOT NULL,
  due_date TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa','quitada')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_debts ON shared_debts(partnership_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shared_debt_events (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  debt_id TEXT NOT NULL REFERENCES shared_debts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('pagamento','haver')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  cash_received INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_debt_events ON shared_debt_events(partnership_id,debt_id,date DESC);

CREATE TABLE IF NOT EXISTS shared_goals (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK(target_amount > 0),
  deadline TEXT,
  category TEXT NOT NULL DEFAULT 'Personalizado',
  is_emergency INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_goals ON shared_goals(partnership_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shared_goal_contributions (
  id TEXT PRIMARY KEY,
  partnership_id TEXT NOT NULL REFERENCES partnerships(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  goal_id TEXT NOT NULL REFERENCES shared_goals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shared_goal_contrib ON shared_goal_contributions(partnership_id,goal_id,date DESC);


-- Carteiras do Ritmo: pessoal de cada usuário + compartilhada do casal.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  couple_id TEXT REFERENCES partnerships(id) ON DELETE CASCADE,
  wallet_type TEXT NOT NULL CHECK(wallet_type IN ('personal','shared')),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('income','expense','transfer')),
  source_wallet TEXT CHECK(source_wallet IS NULL OR source_wallet IN ('personal','shared')),
  destination_wallet TEXT CHECK(destination_wallet IS NULL OR destination_wallet IN ('personal','shared')),
  created_by TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  date TEXT NOT NULL,
  description TEXT,
  source_entity_type TEXT,
  source_entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(transaction_type <> 'transfer' OR (source_wallet IS NOT NULL AND destination_wallet IS NOT NULL AND source_wallet <> destination_wallet))
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_owner_date ON wallet_transactions(owner_user_id,date DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_couple_date ON wallet_transactions(couple_id,date DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON wallet_transactions(transaction_type,wallet_type,date DESC);
