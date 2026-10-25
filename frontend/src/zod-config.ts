import { z } from 'zod'

// The Content-Security-Policy forbids eval. Without this, Zod probes `new Function` once per page
// load to compile faster validators, and the browser reports a CSP violation even though Zod
// falls back silently. Imported first by main.tsx, before any schema is used.
z.config({ jitless: true })
