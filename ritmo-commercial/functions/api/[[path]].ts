import worker, { type Env } from '../../src/worker';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return worker.fetch(request, env);
};
