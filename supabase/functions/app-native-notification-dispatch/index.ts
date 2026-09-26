import { createAppNativePushHandler } from './handler.ts';
Deno.serve(createAppNativePushHandler({env: key => Deno.env.get(key),fetch,crypto}));
