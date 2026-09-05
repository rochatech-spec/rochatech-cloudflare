export interface Env {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  CACHE?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, services: { d1: !!env.DB, r2: !!env.MEDIA, kv: !!env.CACHE } });
    }
    return new Response('Not found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;
