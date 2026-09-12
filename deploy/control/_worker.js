------formdata-undici-024634822529
Content-Disposition: form-data; name="metadata"

{"main_module":"functionsWorker-0.03400272367418733.js"}
------formdata-undici-024634822529
Content-Disposition: form-data; name="functionsWorker-0.03400272367418733.js"; filename="functionsWorker-0.03400272367418733.js"
Content-Type: application/javascript+module

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _lib/auth.ts
var te = new TextEncoder();
var b64u = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64u");
var ub64 = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0)), "ub64");
var sessionSecret = /* @__PURE__ */ __name((env) => {
  const s = env?.SESSION_SECRET || env?.JWT_SECRET;
  if (typeof s !== "string" || s.length < 32) throw new Error("SESSION_SECRET_MISSING");
  return s;
}, "sessionSecret");
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(data))));
}
__name(hmac, "hmac");
async function hashPassword(password, salt = String(crypto.randomUUID())) {
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode(salt), iterations: 12e4 }, key, 256);
  return `${salt}.${b64u(new Uint8Array(bits))}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.includes(".")) return false;
  try {
    const [salt] = stored.split(".");
    return !!salt && await hashPassword(password, salt) === stored;
  } catch {
    return false;
  }
}
__name(verifyPassword, "verifyPassword");
async function signSession(env, payload) {
  const body = b64u(te.encode(JSON.stringify({ ...payload, exp: Date.now() + 1e3 * 60 * 60 * 24 * 30 })));
  return `${body}.${await hmac(sessionSecret(env), body)}`;
}
__name(signSession, "signSession");
async function session(request, env) {
  const a = request.headers.get("Authorization") || "";
  if (!a.startsWith("Bearer ")) return null;
  const [body, sig] = a.slice(7).split(".");
  if (!body || !sig) return null;
  try {
    if (await hmac(sessionSecret(env), body) !== sig) return null;
    const p = JSON.parse(new TextDecoder().decode(ub64(body)));
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
__name(session, "session");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
__name(json, "json");
var id = /* @__PURE__ */ __name((prefix = "id") => `${prefix}_${String(crypto.randomUUID()).replace(/-/g, "")}`, "id");

// api/transactions/[id]/settle.ts
var onRequest = /* @__PURE__ */ __name(async ({ request, env, params }) => {
  try {
    if (request.method !== "POST") return json({ error: "M\xE9todo n\xE3o permitido." }, 405);
    const s = await session(request, env);
    if (!s) return json({ error: "Sess\xE3o expirada." }, 401);
    const tenant = s.tenant, uid = s.uid, txid = String(params.id);
    const tx = await env.DB.prepare("SELECT * FROM transactions WHERE id=? AND tenant_id=?").bind(txid, tenant).first();
    if (!tx) return json({ error: "Lan\xE7amento n\xE3o encontrado." }, 404);
    if (tx.status !== "PAID") await env.DB.prepare("UPDATE transactions SET status='PAID',paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind((/* @__PURE__ */ new Date()).toISOString(), txid, tenant).run();
    await env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,entity,entity_id) VALUES(?,?,?,?,?,?)").bind(id("audit"), tenant, uid, "SETTLE", "transaction", txid).run();
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno. Tente novamente." }, 500);
  }
}, "onRequest");

// api/push/vapid-public.ts
var onRequestGet = /* @__PURE__ */ __name(async () => Response.json({ publicKey: "BKLYFNg_VMmdBoAUCGC22QlXxviDON7fudiUXgBKt-79KXD4BQKFpyYEVUGaIweoqqIpsF_Q7EK3jSpPNrS3gnE" }, { headers: { "cache-control": "public,max-age=86400" } }), "onRequestGet");

// api/[[path]].ts
var money = /* @__PURE__ */ __name((v) => Math.round(Number(v || 0) * 100), "money");
var parse = /* @__PURE__ */ __name(async (r) => {
  try {
    return await r.json();
  } catch {
    return {};
  }
}, "parse");
var route = /* @__PURE__ */ __name((p) => "/" + (Array.isArray(p.path) ? p.path.join("/") : String(p.path || "")), "route");
var today = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "today");
async function audit(env, tenant, uid, action, entity, eid, details) {
  await env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?,?,?)").bind(id("audit"), tenant, uid, action, entity || null, eid || null, details ? JSON.stringify(details).slice(0, 4e3) : null).run();
}
__name(audit, "audit");
async function auth(request, env) {
  return session(request, env);
}
__name(auth, "auth");
async function requireAuth(request, env) {
  const s = await auth(request, env);
  if (!s) throw Object.assign(new Error("Sess\xE3o expirada."), { status: 401 });
  return s;
}
__name(requireAuth, "requireAuth");
async function scheduleJob(env, userId, kind, title, body, sendAt, dueAt) {
  await env.DB.prepare("INSERT INTO notification_jobs(id,user_id,kind,title,body,url,send_at,due_at,status) VALUES(?,?,?,?,?,'/',?,?, 'pending')").bind(id("job"), userId, kind, title, body, sendAt, dueAt || null).run();
}
__name(scheduleJob, "scheduleJob");
async function rebuildJobs(env, userId) {
  await env.DB.prepare("DELETE FROM notification_jobs WHERE user_id=? AND status='pending'").bind(userId).run();
  const { results } = await env.DB.prepare("SELECT type,description,amount_cents,status,due_date FROM transactions WHERE user_id=? AND due_date IS NOT NULL AND status!='PAID' ORDER BY due_date LIMIT 200").bind(userId).all();
  for (const t of results || []) {
    const d = String(t.due_date), ts = (/* @__PURE__ */ new Date(d + "T09:00:00-03:00")).getTime();
    if (!Number.isFinite(ts)) continue;
    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(t.amount_cents) / 100);
    const verb = t.type === "INCOME" ? "entrada" : "despesa";
    await scheduleJob(env, userId, t.type === "INCOME" ? "income_due" : "expense_due", `${t.description} \u2014 ${brl}`, `Sua ${verb} de ${brl} est\xE1 prevista para ${d === today() ? "hoje" : "amanh\xE3"}.`, ts, d);
  }
}
__name(rebuildJobs, "rebuildJobs");
var onRequest2 = /* @__PURE__ */ __name(async ({ request, env, params }) => {
  try {
    const path = route(params), method = request.method.toUpperCase(), url = new URL(request.url);
    if (path === "/health" && method === "GET") return json({ ok: true, service: "CONTROL", version: "4.0.0" });
    if (path === "/auth/register" && method === "POST") {
      const b = await parse(request);
      if (!b.name || !b.email || String(b.password || "").length < 6) return json({ error: "Preencha nome, e-mail e uma senha com 6+ caracteres." }, 400);
      const email = String(b.email).trim().toLowerCase();
      if (await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." }, 409);
      const tenant2 = id("acc"), uid2 = id("usr"), hash = await hashPassword(String(b.password));
      await env.DB.batch([env.DB.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").bind(tenant2, String(b.tenantName || `Conta de ${b.name}`).trim()), env.DB.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES(?,?,?,?,?,'OWNER')").bind(uid2, tenant2, String(b.name).trim(), email, hash)]);
      const user = { id: uid2, tenant_id: tenant2, name: String(b.name).trim(), email, role: "OWNER" };
      return json({ token: await signSession(env, { uid: uid2, tenant: tenant2, role: "OWNER" }), user }, 201);
    }
    if (path === "/auth/login" && method === "POST") {
      const b = await parse(request), email = String(b.email || "").trim().toLowerCase(), u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
      if (!u || !await verifyPassword(String(b.password || ""), u.password_hash)) return json({ error: "E-mail ou senha inv\xE1lidos." }, 401);
      const user = { id: u.id, tenant_id: u.tenant_id, name: u.name, email: u.email, role: u.role };
      return json({ token: await signSession(env, { uid: u.id, tenant: u.tenant_id, role: u.role }), user });
    }
    if (path === "/auth/invite" && method === "POST") {
      const b = await parse(request);
      if (!b.code || !b.name || !b.email || String(b.password || "").length < 6) return json({ error: "Informe c\xF3digo, nome, e-mail e senha." }, 400);
      const code = String(b.code).trim().toUpperCase(), email = String(b.email).trim().toLowerCase(), inv = await env.DB.prepare("SELECT * FROM invites WHERE code=? AND status='PENDING'").bind(code).first();
      if (!inv) return json({ error: "Convite inv\xE1lido ou j\xE1 utilizado." }, 404);
      if (await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return json({ error: "E-mail j\xE1 cadastrado." }, 409);
      const c = await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE tenant_id=? AND role='GUEST'").bind(inv.tenant_id).first();
      if (Number(c.n) >= 2) return json({ error: "Esta conta j\xE1 possui 2 convidados." }, 409);
      const uid2 = id("usr"), hash = await hashPassword(String(b.password));
      await env.DB.batch([env.DB.prepare("INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES(?,?,?,?,?,'GUEST')").bind(uid2, inv.tenant_id, String(b.name).trim(), email, hash), env.DB.prepare("UPDATE invites SET status='ACCEPTED' WHERE id=?").bind(inv.id)]);
      const user = { id: uid2, tenant_id: inv.tenant_id, name: String(b.name).trim(), email, role: "GUEST" };
      return json({ token: await signSession(env, { uid: uid2, tenant: inv.tenant_id, role: "GUEST" }), user }, 201);
    }
    const s = await requireAuth(request, env), tenant = s.tenant, uid = s.uid;
    if (path === "/me" && method === "GET") {
      const u = await env.DB.prepare("SELECT id,tenant_id,name,email,role FROM users WHERE id=? AND tenant_id=?").bind(uid, tenant).first();
      return u ? json(u) : json({ error: "Usu\xE1rio n\xE3o encontrado." }, 404);
    }
    if (path === "/summary" && method === "GET") {
      const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN type='INCOME' AND status='PAID' THEN amount_cents ELSE 0 END),0) income_cents,COALESCE(SUM(CASE WHEN type='EXPENSE' AND status='PAID' THEN amount_cents ELSE 0 END),0) expense_cents,COALESCE(SUM(CASE WHEN type='INCOME' AND status IN('PENDING','OVERDUE') THEN amount_cents ELSE 0 END),0) receivable_cents,COALESCE(SUM(CASE WHEN type='EXPENSE' AND status IN('PENDING','OVERDUE') THEN amount_cents ELSE 0 END),0) payable_cents FROM transactions WHERE tenant_id=?").bind(tenant).first();
      const rr = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind='DEPOSIT' THEN amount_cents ELSE -amount_cents END),0) reserve_cents FROM reserve_entries WHERE tenant_id=?").bind(tenant).first();
      const base = await env.DB.prepare("SELECT base_balance_cents FROM account_settings WHERE tenant_id=?").bind(tenant).first();
      const income = Number(r.income_cents || 0), expense = Number(r.expense_cents || 0), balance = Number(base?.base_balance_cents || 0) + income - expense;
      return json({ ...r, balance_cents: balance, pending_cents: Number(r.receivable_cents || 0) + Number(r.payable_cents || 0), projected_balance_cents: balance + Number(r.receivable_cents || 0) - Number(r.payable_cents || 0), reserve_cents: Number(rr?.reserve_cents || 0) });
    }
    if (path === "/transactions" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT t.*,c.name category FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.tenant_id=? ORDER BY COALESCE(t.due_date,t.created_at) DESC,t.created_at DESC LIMIT 500").bind(tenant).all();
      return json({ items: results });
    }
    if (path === "/transactions" && method === "POST") {
      const b = await parse(request);
      if (!["INCOME", "EXPENSE"].includes(b.type) || !String(b.description || "").trim() || !Number.isFinite(Number(b.amount)) || Number(b.amount) < 0) return json({ error: "Dados do lan\xE7amento inv\xE1lidos." }, 400);
      const rid = id("tx"), status = ["PENDING", "OVERDUE"].includes(String(b.status)) ? String(b.status) : "PAID";
      await env.DB.prepare("INSERT INTO transactions(id,tenant_id,user_id,type,description,amount_cents,category_id,status,due_date,paid_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(rid, tenant, uid, b.type, String(b.description).trim(), money(b.amount), b.category_id || null, status, b.due_date || null, status === "PAID" ? (/* @__PURE__ */ new Date()).toISOString() : null, b.notes || null).run();
      await audit(env, tenant, uid, "CREATE", "transaction", rid);
      if (status !== "PAID" && b.due_date) await rebuildJobs(env, uid);
      return json({ id: rid }, 201);
    }
    let m = path.match(/^\/transactions\/([^/]+)$/);
    if (m && method === "PUT") {
      const b = await parse(request), cur = await env.DB.prepare("SELECT * FROM transactions WHERE id=? AND tenant_id=?").bind(m[1], tenant).first();
      if (!cur) return json({ error: "Lan\xE7amento n\xE3o encontrado." }, 404);
      const status = ["PENDING", "OVERDUE", "PAID"].includes(String(b.status)) ? String(b.status) : cur.status;
      await env.DB.prepare("UPDATE transactions SET type=?,description=?,amount_cents=?,status=?,due_date=?,paid_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(b.type || cur.type, String(b.description || cur.description).trim(), b.amount === void 0 ? cur.amount_cents : money(b.amount), status, b.due_date ?? cur.due_date, status === "PAID" ? cur.paid_at || (/* @__PURE__ */ new Date()).toISOString() : null, b.notes ?? cur.notes, m[1], tenant).run();
      await audit(env, tenant, uid, "UPDATE", "transaction", m[1]);
      await rebuildJobs(env, uid);
      return json({ ok: true });
    }
    m = path.match(/^\/transactions\/([^/]+)\/settle$/);
    if (m && method === "POST") {
      const cur = await env.DB.prepare("SELECT * FROM transactions WHERE id=? AND tenant_id=?").bind(m[1], tenant).first();
      if (!cur) return json({ error: "Lan\xE7amento n\xE3o encontrado." }, 404);
      if (cur.status === "PAID") return json({ ok: true });
      await env.DB.prepare("UPDATE transactions SET status='PAID',paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant=?").bind((/* @__PURE__ */ new Date()).toISOString(), m[1], tenant).run();
      await audit(env, tenant, uid, "SETTLE", "transaction", m[1]);
      await rebuildJobs(env, uid);
      return json({ ok: true });
    }
    if (m && method === "DELETE") {
      await env.DB.prepare("DELETE FROM transactions WHERE id=? AND tenant_id=?").bind(m[1], tenant).run();
      await audit(env, tenant, uid, "DELETE", "transaction", m[1]);
      await rebuildJobs(env, uid);
      return json({ ok: true });
    }
    if (path === "/goals" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM goals WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200").bind(tenant).all();
      return json({ items: results });
    }
    if (path === "/goals" && method === "POST") {
      const b = await parse(request);
      if (!b.name || Number(b.target) <= 0) return json({ error: "Meta inv\xE1lida." }, 400);
      const gid = id("goal");
      await env.DB.prepare("INSERT INTO goals(id,tenant_id,name,target_cents,current_cents,deadline) VALUES(?,?,?,?,?,?)").bind(gid, tenant, String(b.name).trim(), money(b.target), money(b.current), b.deadline || null).run();
      if (b.deadline) await scheduleJob(env, uid, "goal_deadline", `Meta: ${String(b.name).trim()}`, `A meta ${String(b.name).trim()} est\xE1 pr\xF3xima do prazo.`, (/* @__PURE__ */ new Date(String(b.deadline) + "T09:00:00-03:00")).getTime(), b.deadline);
      await audit(env, tenant, uid, "CREATE", "goal", gid);
      return json({ id: gid }, 201);
    }
    m = path.match(/^\/goals\/([^/]+)$/);
    if (m && method === "PUT") {
      const b = await parse(request);
      if (!b.name || Number(b.target) <= 0) return json({ error: "Meta inv\xE1lida." }, 400);
      await env.DB.prepare("UPDATE goals SET name=?,target_cents=?,current_cents=?,deadline=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(String(b.name).trim(), money(b.target), money(b.current), b.deadline || null, m[1], tenant).run();
      await audit(env, tenant, uid, "UPDATE", "goal", m[1]);
      return json({ ok: true });
    }
    if (path === "/reserve" && method === "POST") {
      const b = await parse(request);
      if (!["DEPOSIT", "WITHDRAW"].includes(b.kind) || Number(b.amount) <= 0) return json({ error: "Movimenta\xE7\xE3o inv\xE1lida." }, 400);
      if (b.kind === "WITHDRAW") {
        const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind='DEPOSIT' THEN amount_cents ELSE -amount_cents END),0) balance FROM reserve_entries WHERE tenant_id=?").bind(tenant).first();
        if (money(b.amount) > Number(r.balance || 0)) return json({ error: "Saldo insuficiente na reserva." }, 409);
      }
      const rid = id("res");
      await env.DB.prepare("INSERT INTO reserve_entries(id,tenant_id,user_id,amount_cents,kind,note) VALUES(?,?,?,?,?,?)").bind(rid, tenant, uid, money(b.amount), b.kind, b.note || null).run();
      await audit(env, tenant, uid, "CREATE", "reserve", rid);
      return json({ ok: true }, 201);
    }
    if (path === "/debts" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT d.*,COALESCE((SELECT SUM(amount_cents) FROM debt_movements dm WHERE dm.debt_id=d.id),0) paid_cents FROM debts d WHERE d.tenant_id=? ORDER BY d.created_at DESC LIMIT 200").bind(tenant).all();
      return json({ items: results });
    }
    if (path === "/debts" && method === "POST") {
      const b = await parse(request);
      if (!b.name || Number(b.total) < 0 || Number(b.remaining) < 0 || Number(b.remaining) > Number(b.total)) return json({ error: "D\xEDvida inv\xE1lida." }, 400);
      const did = id("debt");
      await env.DB.prepare("INSERT INTO debts(id,tenant_id,name,total_cents,remaining_cents,due_date) VALUES(?,?,?,?,?,?)").bind(did, tenant, String(b.name).trim(), money(b.total), money(b.remaining), b.due_date || null).run();
      await audit(env, tenant, uid, "CREATE", "debt", did);
      return json({ id: did }, 201);
    }
    m = path.match(/^\/debts\/([^/]+)\/payment$/);
    if (m && method === "POST") {
      const b = await parse(request), d = await env.DB.prepare("SELECT * FROM debts WHERE id=? AND tenant_id=?").bind(m[1], tenant).first();
      if (!d) return json({ error: "D\xEDvida n\xE3o encontrada." }, 404);
      const amount = money(b.amount);
      if (amount <= 0 || amount > Number(d.remaining_cents)) return json({ error: "Abatimento inv\xE1lido." }, 400);
      const rem = Number(d.remaining_cents) - amount, dm = id("dm"), tx = id("tx");
      await env.DB.batch([env.DB.prepare("INSERT INTO debt_movements(id,tenant_id,debt_id,user_id,amount_cents,note) VALUES(?,?,?,?,?,?)").bind(dm, tenant, d.id, uid, amount, b.note || null), env.DB.prepare("UPDATE debts SET remaining_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").bind(rem, d.id, tenant), env.DB.prepare("INSERT INTO transactions(id,tenant_id,user_id,type,description,amount_cents,status,paid_at,notes) VALUES(?,?,?,?,?,?,'PAID',?,?)").bind(tx, tenant, uid, "EXPENSE", `Pagamento: ${d.name}`, amount, (/* @__PURE__ */ new Date()).toISOString(), b.note || null)]);
      await audit(env, tenant, uid, "PAYMENT", "debt", d.id, { amount, remaining: rem });
      await rebuildJobs(env, uid);
      return json({ ok: true, remaining_cents: rem });
    }
    if (path === "/settings" && method === "GET") {
      let r = await env.DB.prepare("SELECT * FROM app_settings WHERE user_id=?").bind(uid).first();
      if (!r) {
        await env.DB.prepare("INSERT OR IGNORE INTO app_settings(user_id) VALUES(?)").bind(uid).run();
        r = await env.DB.prepare("SELECT * FROM app_settings WHERE user_id=?").bind(uid).first();
      }
      return json(r);
    }
    if (path === "/settings" && method === "PUT") {
      const b = await parse(request);
      const theme = ["system", "light", "dark"].includes(b.theme) ? b.theme : "system", mins = [0, 5, 15, 30, 60].includes(Number(b.auto_logout_minutes)) ? Number(b.auto_logout_minutes) : 15;
      await env.DB.prepare("INSERT INTO app_settings(user_id,theme,hide_values,auto_logout_minutes,save_login,notifications_enabled,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,hide_values=excluded.hide_values,auto_logout_minutes=excluded.auto_logout_minutes,save_login=excluded.save_login,notifications_enabled=excluded.notifications_enabled,updated_at=CURRENT_TIMESTAMP").bind(uid, theme, b.hide_values ? 1 : 0, mins, b.save_login ? 1 : 0, b.notifications_enabled ? 1 : 0).run();
      return json({ ok: true });
    }
    if (path === "/push/vapid-public" && method === "GET") return json({ publicKey: env.VAPID_PUBLIC_KEY || "" });
    if (path === "/push/subscribe" && method === "POST") {
      const b = await parse(request);
      if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) return json({ error: "Assinatura push inv\xE1lida." }, 400);
      const device = String(b.device_id || "default").slice(0, 128);
      await env.DB.prepare("INSERT INTO push_subscriptions(id,user_id,device_id,endpoint,p256dh,auth,updated_at,revoked_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,device_id=excluded.device_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=CURRENT_TIMESTAMP,revoked_at=NULL").bind(id("push"), uid, device, b.endpoint, b.keys.p256dh, b.keys.auth).run();
      await env.DB.prepare("UPDATE app_settings SET notifications_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
      return json({ ok: true });
    }
    if (path === "/push/unsubscribe" && method === "POST") {
      const b = await parse(request);
      if (b.endpoint) await env.DB.prepare("UPDATE push_subscriptions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND endpoint=?").bind(uid, String(b.endpoint)).run();
      else await env.DB.prepare("UPDATE push_subscriptions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
      await env.DB.prepare("UPDATE app_settings SET notifications_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(uid).run();
      return json({ ok: true });
    }
    if (path === "/push/test" && method === "POST") {
      await scheduleJob(env, uid, "test", "Control", "Notifica\xE7\xF5es ativadas com sucesso.", Date.now());
      return json({ ok: true });
    }
    if (path === "/guests" && method === "GET") {
      if (s.role !== "OWNER") return json({ items: [], invites: [] });
      const [u, i] = await Promise.all([env.DB.prepare("SELECT id,name,email,created_at FROM users WHERE tenant_id=? AND role='GUEST' ORDER BY created_at").bind(tenant).all(), env.DB.prepare("SELECT id,email,code,status,created_at FROM invites WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20").bind(tenant).all()]);
      return json({ items: u.results, invites: i.results });
    }
    if (path === "/guests" && method === "POST") {
      if (s.role !== "OWNER") return json({ error: "Somente o titular pode convidar." }, 403);
      const c = await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE tenant_id=? AND role='GUEST'").bind(tenant).first();
      if (Number(c.n) >= 2) return json({ error: "Limite de 2 convidados atingido." }, 409);
      const code = String(crypto.randomUUID()).replace(/-/g, "").slice(0, 8).toUpperCase(), iid = id("inv");
      await env.DB.prepare("INSERT INTO invites(id,tenant_id,code) VALUES(?,?,?)").bind(iid, tenant, code).run();
      return json({ code }, 201);
    }
    return json({ error: "Rota n\xE3o encontrada." }, 404);
  } catch (e) {
    console.error("CONTROL_API_ERROR", e);
    return json({ error: e?.message === "Sess\xE3o expirada." ? "Sess\xE3o expirada." : "Erro interno. Tente novamente." }, e?.status || 500);
  }
}, "onRequest");

// ../.wrangler/tmp/pages-c4yw9X/functionsRoutes-0.8456575761553966.mjs
var routes = [
  {
    routePath: "/api/transactions/:id/settle",
    mountPath: "/api/transactions/:id",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/push/vapid-public",
    mountPath: "/api/push",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  }
];

// ../../../../../.npm/_npx/d77349f55c2be1c0/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse2(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse2, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse2(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route2 = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route2 += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route2 += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route2 += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route2 += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route2 += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route2 += "".concat(delimiterRe, "?");
    route2 += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route2 += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route2 += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route2, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route2 of [...routes].reverse()) {
    if (route2.method && route2.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route2.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route2.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route2.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route2 of routes) {
    if (route2.method && route2.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route2.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route2.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route2.modules.length) {
      for (const handler of route2.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};

------formdata-undici-024634822529--
