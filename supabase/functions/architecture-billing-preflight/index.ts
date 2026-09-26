import { createHandler } from './handler.ts';
Deno.serve(createHandler({ getEnv: name => Deno.env.get(name), fetch }));
