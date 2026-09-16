import { createNativePushHandler } from './handler.ts';

Deno.serve(createNativePushHandler({
  env: key => Deno.env.get(key),
  fetch,
  crypto,
}));
