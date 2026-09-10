export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(trigger(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'ritmo-notify', schedule: 'hourly' });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      const supplied = request.headers.get('X-Ritmo-Cron-Secret') || '';
      if (!env.CRON_SECRET || supplied !== env.CRON_SECRET) {
        return Response.json({ ok: false }, { status: 403 });
      }
      return trigger(env);
    }
    return new Response('Not found', { status: 404 });
  }
};

async function trigger(env) {
  if (!env.CRON_SECRET) {
    return Response.json({ ok: false, reason: 'missing-secret' }, { status: 500 });
  }
  const target = env.TARGET_URL || 'https://ritmo-commercial.pages.dev/api/push/cron';
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'X-Ritmo-Cron-Secret': env.CRON_SECRET,
      'User-Agent': 'Ritmo-Scheduled-Notifications/1.0'
    }
  });
  const text = await response.text();
  if (!response.ok) {
    console.error('Ritmo cron push failed', response.status, text.slice(0, 500));
  }
  return new Response(text || JSON.stringify({ ok: response.ok }), {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' }
  });
}
