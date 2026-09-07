import { Hono } from 'hono';
import core from './core.js';

type Bindings = {
  DB: D1Database;
  AVATARS: KVNamespace;
  AUTH_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Hono is the HTTP edge entrypoint. Core keeps the financial domain logic
// framework-agnostic so it is cheap to test and deploy.
app.all('*', (c) => core.fetch(c.req.raw, c.env, c.executionCtx));

export default app;
