# Next.js 16 example

Demonstrates `@next-server-tools/standalone` on Next.js 16 with the same feature showcase as `examples/next-15` (`server/` + `server.config.ts`).

## Scripts

```bash
pnpm dev:16
pnpm build:16
pnpm start:16
```

## Feature map

| Feature | Where | Smoke check |
| --- | --- | --- |
| Middleware order + plugin logger | `server/plugins/logger.ts`, `10-request-id` | `GET /` → `x-request-id` |
| Config inline middleware | `server.config.ts` | `x-demo-config: 1` |
| Plugin `provide` / `get` | `demo-stats` + `15-demo-service` | `x-demo-service: demo` |
| Short-circuit | `20-healthz` | `GET /healthz` → `{ ok: true }` |
| Lifecycle counters | `demo-stats` hooks | `GET /demo/stats` |
| `match` exact / prefix / RegExp | `40`–`42` middleware | `/demo/exact`, `/demo/prefix/a`, `/demo/re-1` |
| Error middleware | `50-demo-boom` + `90-demo-error` | `GET /demo/boom` → `418` |
| `request:error` | `51-demo-crash` | `GET /demo/crash` → `500`, stats |
| `server:start` / `shutdown` markers | hooks `10` / `30` | `.demo-markers/` |
| `server:ready` | `20-server-ready` | log line |
| Next App Router + Route Handler | `app/page.tsx`, `app/api/ok` | `GET /`, `GET /api/ok` |
| Standalone static copy | `public/next.svg` | `200` after `start` |
