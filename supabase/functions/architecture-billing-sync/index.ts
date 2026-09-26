import { createSyncHandler } from './handler.ts';
Deno.serve(createSyncHandler({getEnv:name=>Deno.env.get(name),fetch,now:()=>new Date()}));
