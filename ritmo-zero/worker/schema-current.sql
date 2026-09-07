PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL COLLATE NOCASE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,avatar_kv_key TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,locale TEXT NOT NULL DEFAULT 'pt-BR',currency TEXT NOT NULL DEFAULT 'BRL',theme TEXT NOT NULL DEFAULT 'SYSTEM' CHECK(theme IN ('LIGHT','DARK','SYSTEM')),biometric_enabled INTEGER NOT NULL DEFAULT 0,notifications_enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,device_name TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,revoked_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('PERSONAL','COUPLE')),name TEXT NOT NULL,created_by_user_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('OWNER','PARTNER')),status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEFT','REMOVED')),joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,left_at TEXT,PRIMARY KEY(workspace_id,user_id),FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS workspace_invites (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,invited_by_user_id TEXT NOT NULL,invited_email TEXT NOT NULL COLLATE NOCASE,token_hash TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','EXPIRED','CANCELED')),expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,accepted_at TEXT,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS money_sources (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'OTHER' CHECK(type IN ('ACCOUNT','CASH','WALLET','SAVINGS','OTHER')),initial_balance REAL NOT NULL DEFAULT 0,current_balance REAL NOT NULL DEFAULT 0,icon TEXT NOT NULL DEFAULT 'account_balance_wallet',color TEXT NOT NULL DEFAULT '#0F4C5C',is_archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),icon TEXT NOT NULL,color TEXT NOT NULL,is_default INTEGER NOT NULL DEFAULT 0,is_archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,title TEXT NOT NULL,total_amount REAL NOT NULL CHECK(total_amount>=0),remaining_amount REAL NOT NULL CHECK(remaining_amount>=0),status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','CANCELED')),due_date TEXT,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,debt_id TEXT NOT NULL,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,money_source_id TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),payment_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(money_source_id) REFERENCES money_sources(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,money_source_id TEXT NOT NULL,destination_source_id TEXT,category_id TEXT,type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE','TRANSFER')),amount REAL NOT NULL CHECK(amount>0),description TEXT NOT NULL,frequency TEXT NOT NULL CHECK(frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),interval_count INTEGER NOT NULL DEFAULT 1,next_date TEXT NOT NULL,end_date TEXT,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(money_source_id) REFERENCES money_sources(id) ON DELETE RESTRICT,FOREIGN KEY(destination_source_id) REFERENCES money_sources(id) ON DELETE RESTRICT,FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,money_source_id TEXT NOT NULL,destination_source_id TEXT,category_id TEXT,debt_payment_id TEXT,recurring_id TEXT,type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE','TRANSFER')),status TEXT NOT NULL DEFAULT 'PAID' CHECK(status IN ('PENDING','PAID','CANCELED')),amount REAL NOT NULL CHECK(amount>0),description TEXT NOT NULL,date TEXT NOT NULL,due_date TEXT,paid_at TEXT,notes TEXT,client_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,FOREIGN KEY(money_source_id) REFERENCES money_sources(id) ON DELETE RESTRICT,FOREIGN KEY(destination_source_id) REFERENCES money_sources(id) ON DELETE RESTRICT,FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,FOREIGN KEY(debt_payment_id) REFERENCES debt_payments(id) ON DELETE CASCADE,FOREIGN KEY(recurring_id) REFERENCES recurring_transactions(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,title TEXT NOT NULL,target_amount REAL NOT NULL CHECK(target_amount>0),current_amount REAL NOT NULL DEFAULT 0 CHECK(current_amount>=0),deadline TEXT,icon TEXT NOT NULL DEFAULT 'flag',color TEXT NOT NULL DEFAULT '#7CA982',kind TEXT NOT NULL DEFAULT 'GOAL' CHECK(kind IN ('GOAL','EMERGENCY_RESERVE')),status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','ARCHIVED')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS goal_entries (
  id TEXT PRIMARY KEY,goal_id TEXT NOT NULL,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,amount REAL NOT NULL,entry_date TEXT NOT NULL,note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,year INTEGER NOT NULL,month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),total_amount REAL NOT NULL CHECK(total_amount>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,UNIQUE(workspace_id,year,month),FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS budget_categories (
  id TEXT PRIMARY KEY,budget_id TEXT NOT NULL,workspace_id TEXT NOT NULL,category_id TEXT NOT NULL,limit_amount REAL NOT NULL CHECK(limit_amount>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,version INTEGER NOT NULL DEFAULT 1,UNIQUE(budget_id,category_id),FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE CASCADE,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS couple_contributions (
  id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,created_by_user_id TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),date TEXT NOT NULL,description TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL,workspace_id TEXT,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,read_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,status_code INTEGER NOT NULL,response_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,PRIMARY KEY(user_id,idempotency_key),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN ('UPSERT','DELETE')),version INTEGER NOT NULL,changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,workspace_id TEXT,user_id TEXT,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,metadata_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id,status);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(invited_email,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_sources_workspace ON money_sources(workspace_id,is_archived);
CREATE INDEX IF NOT EXISTS idx_categories_workspace_type ON categories(workspace_id,type,is_archived);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_date ON transactions(workspace_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_workspace_status_due ON transactions(workspace_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_creator ON transactions(created_by_user_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_debts_workspace_status_due ON debts(workspace_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_goal_entries_goal_date ON goal_entries(goal_id,entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_goals_workspace_status ON goals(workspace_id,status);
CREATE INDEX IF NOT EXISTS idx_budgets_workspace_period ON budgets(workspace_id,year,month);
CREATE INDEX IF NOT EXISTS idx_contributions_workspace_date ON couple_contributions(workspace_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id,is_read,created_at DESC);
