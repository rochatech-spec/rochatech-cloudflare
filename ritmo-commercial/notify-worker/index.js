export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(trigger(env));
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'ritmo-notify', schedule: 'daily-morning-bahia' });
    }
    return new Response('Not found', { status: 404 });
  }
};

async function trigger(env) {
  const target = env.TARGET_URL || 'https://ritmo-commercial.pages.dev/api/push/cron';
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'User-Agent': 'Ritmo-Scheduled-Notifications/1.0' }
  });
  if (!response.ok) {
    console.error('Ritmo scheduled push failed', response.status);
  }
}
