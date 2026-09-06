from pathlib import Path
import sys

root=Path(sys.argv[1])
schema=root/'schema.sql'
worker=root/'_worker.js'

sc=schema.read_text()
if 'CREATE TABLE IF NOT EXISTS user_mobile_settings' not in sc:
    sc += '''\n\nCREATE TABLE IF NOT EXISTS user_mobile_settings (\n  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,\n  mobile_shortcuts TEXT NOT NULL DEFAULT '["expenses","debts","goals"]',\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n'''
schema.write_text(sc)

s=worker.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'Worker trecho não encontrado: {label}')
    s=s.replace(old,new,1)

rep(
"const [profile,settings,incomes,expenses,debts,events,goals,contribs,webauthn]=await Promise.all([",
"const [profile,settings,mobileSettings,incomes,expenses,debts,events,goals,contribs,webauthn]=await Promise.all([",
'bootstrap destructuring')
rep(
"env.DB.prepare(`SELECT theme,notifications_enabled,notify_due,notify_overdue,notify_goals,reminder_days,monthly_summary,auto_lock_minutes FROM user_settings WHERE user_id=?`).bind(userId).first(),",
"env.DB.prepare(`SELECT theme,notifications_enabled,notify_due,notify_overdue,notify_goals,reminder_days,monthly_summary,auto_lock_minutes FROM user_settings WHERE user_id=?`).bind(userId).first(),\n    env.DB.prepare(`SELECT mobile_shortcuts FROM user_mobile_settings WHERE user_id=?`).bind(userId).first(),",
'bootstrap mobile settings query')
old="return {profile,settings:settings||{theme:'system',notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,auto_lock_minutes:5},incomes:mapMoney(incomes.results||[]),expenses:mapMoney(expenses.results||[]),debts:debtRows,debt_events:ev,goals:goalRows,goal_contributions:contrib,security:{webauthn_count:Number(webauthn?.count||0)},server_time:now()};"
new="const baseSettings=settings||{theme:'system',notifications_enabled:1,notify_due:1,notify_overdue:1,notify_goals:1,reminder_days:3,monthly_summary:1,auto_lock_minutes:5};\n  return {profile,settings:{...baseSettings,mobile_shortcuts:mobileSettings?.mobile_shortcuts||'[\"expenses\",\"debts\",\"goals\"]'},incomes:mapMoney(incomes.results||[]),expenses:mapMoney(expenses.results||[]),debts:debtRows,debt_events:ev,goals:goalRows,goal_contributions:contrib,security:{webauthn_count:Number(webauthn?.count||0)},server_time:now()};"
rep(old,new,'bootstrap return')

old_route="if(path==='/api/settings'&&request.method==='PATCH'){\n    const b=await body(request);const keys=['theme','notifications_enabled','notify_due','notify_overdue','notify_goals','reminder_days','monthly_summary','auto_lock_minutes'];const current=await env.DB.prepare(`SELECT * FROM user_settings WHERE user_id=?`).bind(userId).first();const v={...current};for(const k of keys)if(k in b)v[k]=b[k];\n    await env.DB.prepare(`UPDATE user_settings SET theme=?,notifications_enabled=?,notify_due=?,notify_overdue=?,notify_goals=?,reminder_days=?,monthly_summary=?,auto_lock_minutes=?,updated_at=? WHERE user_id=?`).bind(v.theme||'system',v.notifications_enabled?1:0,v.notify_due?1:0,v.notify_overdue?1:0,v.notify_goals?1:0,Math.min(30,Math.max(0,Number(v.reminder_days||0))),v.monthly_summary?1:0,Math.min(60,Math.max(0,Number(v.auto_lock_minutes||5))),now(),userId).run();await bump(env,userId,'update','settings',userId);return json({ok:true});\n  }"
new_route="if(path==='/api/settings'&&request.method==='PATCH'){\n    if(!sameOrigin(request))return json({error:'Origem inválida'},403);\n    const b=await body(request);const keys=['theme','notifications_enabled','notify_due','notify_overdue','notify_goals','reminder_days','monthly_summary','auto_lock_minutes'];const current=await env.DB.prepare(`SELECT * FROM user_settings WHERE user_id=?`).bind(userId).first();const v={...current};for(const k of keys)if(k in b)v[k]=b[k];\n    await env.DB.prepare(`UPDATE user_settings SET theme=?,notifications_enabled=?,notify_due=?,notify_overdue=?,notify_goals=?,reminder_days=?,monthly_summary=?,auto_lock_minutes=?,updated_at=? WHERE user_id=?`).bind(v.theme||'system',v.notifications_enabled?1:0,v.notify_due?1:0,v.notify_overdue?1:0,v.notify_goals?1:0,Math.min(30,Math.max(0,Number(v.reminder_days||0))),v.monthly_summary?1:0,Math.min(60,Math.max(0,Number(v.auto_lock_minutes||5))),now(),userId).run();\n    if('mobile_shortcuts' in b){const allowed=new Set(['expenses','debts','goals','calendar','insights','settings']);const src=Array.isArray(b.mobile_shortcuts)?b.mobile_shortcuts:[];const shortcuts=[];for(const k of src){if(allowed.has(k)&&!shortcuts.includes(k))shortcuts.push(k)}if(shortcuts.length!==3)return json({error:'Escolha exatamente três atalhos.'},400);await env.DB.prepare(`INSERT INTO user_mobile_settings(user_id,mobile_shortcuts,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET mobile_shortcuts=excluded.mobile_shortcuts,updated_at=excluded.updated_at`).bind(userId,JSON.stringify(shortcuts),now()).run()}\n    await bump(env,userId,'update','settings',userId);return json({ok:true});\n  }"
rep(old_route,new_route,'settings route')

worker.write_text(s)
print('Backend Ritmo v6 atualizado: atalhos persistidos no D1.')
