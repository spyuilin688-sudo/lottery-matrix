import { handler } from './handler.ts';

// Supabase supplies this Fetch server runtime; no scheduler is registered here.
declare const Deno: { serve(handler: (request: Request) => Promise<Response>): unknown };
Deno.serve(handler);

