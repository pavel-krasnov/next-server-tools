# @next-server-tools/standalone

**Custom Node.js server for Next.js `output: 'standalone'`.**

Built for teams who **self-host** Next on Node (Docker, Kubernetes, VMs) and want a portable runtime they control. Next stays focused on **rendering** (App Router / SSR / RSC); cross-cutting server work — health checks, auth gates, logging, TLS, graceful shutdown — lives in your `server/` extensions instead of platform-specific hooks.

Next.js documents that [standalone mode and a custom server cannot be used together](https://nextjs.org/docs/app/guides/custom-server) — standalone emits its own `server.js` and does not trace yours. This package owns that entry: replace the generated standalone server, keep a lean deploy image, and extend the runtime with **middleware**, **hooks**, and **plugins** (same model in `dev` and production `start`).

You never hand-edit `server.js`. Production **requires** `output: 'standalone'`.

For architecture, request lifecycle, standalone replacement, and API details, see **[Technical documentation](./docs/TECHNICAL.md)**. Agent-oriented summary (published with the package): **[llms.txt](./llms.txt)**.

## Install

```bash
pnpm add @next-server-tools/standalone
```

Peer dependency: `next` >= 15.

## Required: standalone output

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

Without this, `replace-standalone` / `start` have nothing to target. Dev (`nst dev`) works without it; production does not.

## Scripts

```json
{
  "scripts": {
    "dev": "nst dev",
    "build": "next build && nst replace-standalone",
    "start": "nst start"
  }
}
```

## Extension model

| Primitive | Role |
| --- | --- |
| **Middleware** | Async onion `(ctx, next)` — transform or short-circuit requests |
| **Hooks** | Lifecycle observers (`server:ready`, `request:error`, …) |
| **Plugins** | Packages that register middleware, hooks, and services |

### Project layout

```text
server.config.ts
server/
  middleware/
    10-request-id.ts
    20-healthz.ts
  hooks/
    10-server-start.ts
    20-server-ready.ts
  plugins/
    logger.ts
```

Merge order: `server.config.*` → filesystem `server/middleware|hooks|plugins` → inline `config.middlewares` / `hooks` / `plugins`.  
Numeric filename prefixes (`10-`, `20-`) set default `order` when omitted. Middleware registered in plugin `setup()` is appended after filesystem middleware, then sorted by `order`.

### Middleware

```ts
import { defineMiddleware } from "@next-server-tools/standalone";

export default defineMiddleware({ name: "healthz", order: 20 }, async (ctx, next) => {
  if (ctx.req.url.pathname === "/healthz") {
    ctx.res.status = 200;
    ctx.res.headers.set("content-type", "application/json");
    await ctx.res.end(JSON.stringify({ ok: true }));
    return; // short-circuit — Next is not called
  }
  await next();
});
```

### Hooks

```ts
import { defineHook } from "@next-server-tools/standalone";

export default defineHook("server:ready", async ({ log, runtime }) => {
  log.info("listening", { url: runtime.url });
});
```

Available hooks: `server:start`, `server:ready`, `server:shutdown`, `request:start`, `request:finish`, `request:error`, `next:before`, `next:after`, `response:sent`.

### Plugins

```ts
import { definePlugin } from "@next-server-tools/standalone";

export default definePlugin({
  name: "logger",
  setup(api) {
    api.middleware({
      name: "logger/request",
      order: 5,
      handler: async (ctx, next) => {
        const mark = ctx.timing.mark("request");
        try {
          await next();
        } finally {
          mark.end();
          ctx.log.info("request", {
            path: ctx.req.url.pathname,
            ms: Math.round(mark.ms),
          });
        }
      },
    });
  },
});
```

### Config

```ts
import { defineConfig } from "@next-server-tools/standalone";

export default defineConfig({
  shutdownTimeoutMs: 10_000,
  // plugins / middlewares / hooks can also be listed here
});
```

## Context

Middleware receives a stable `Context`:

- `id` — request id  
- `req` / `res` — Web-ish ports (`URL`, `Headers`) with optional `.raw` Node escape hatches  
- `state` — request-scoped bag (`set` / `get`)  
- `log`, `config`, `runtime`, `timing`, `trace`, `meta`

Prefer ports over `.raw` so the API can grow to other adapters later.

## Standalone

`replace-standalone` copies the library server into `{distDir}/standalone/**/server.js`, bundles discovered extensions into `server-extensions.cjs` beside it, and by default also copies `{distDir}/static` + `public` into the standalone tree. Production `start` runs that entry.

`dir` defaults to the project root (`cwd`). `distDir` defaults to `.next` (Next’s build output folder) and is resolved relative to `dir`.

```bash
# custom Next.js distDir
nst replace-standalone --dist-dir build
nst start --dist-dir build
```

When assets are served from a CDN or reverse-proxy sidecar, skip the static copy:

```bash
nst replace-standalone --no-copy-static
```

To bake TLS files into the standalone image (so `HTTPS=1` can resolve `{cwd}/ssl` after deploy), opt in:

```bash
nst replace-standalone --copy-ssl
```

```ts
import { replaceStandaloneServer } from "@next-server-tools/standalone";

await replaceStandaloneServer({ copyStatic: false });
await replaceStandaloneServer({ copySsl: true });
await replaceStandaloneServer({ distDir: "build" });
```

## Programmatic API

```ts
import {
  startCustomServer,
  startStandaloneServer,
  defineMiddleware,
} from "@next-server-tools/standalone";

await startCustomServer({ dir: process.cwd(), dev: true });

// Force Turbopack (Next 15 custom-server default is webpack)
await startCustomServer({ dir: process.cwd(), dev: true, turbopack: true });
```

## Dev bundler (Turbopack / webpack)

`nst` calls Next’s programmatic API. Bundler selection is **not** inferred from `next.config` (`turbopack: { … }` only configures Turbopack once it is already selected).

```bash
nst dev --turbopack   # pass turbopack: true to next()
nst dev --webpack     # pass webpack: true to next() (Next 16+ opt-out)
```

When neither flag is set, Next’s version default applies. `--turbopack` and `--webpack` are mutually exclusive and apply to `nst dev` only.

## HTTP / HTTPS

HTTP is the default. Enable HTTPS with `--https` / `https: true` (or env `HTTPS=1`).
`CERT` / `KEY` only set certificate paths (defaults: `ssl/server.crt` + `ssl/server.key`).

```bash
# uses {dir}/ssl/server.crt + {dir}/ssl/server.key
nst dev --https

# custom filenames under {dir}/ssl (or absolute paths)
nst dev --https --cert my.crt --key my.key

# env
HTTPS=1 CERT=server.crt KEY=server.key nst start
```

```ts
await startCustomServer({
  dir: process.cwd(),
  https: true,
  // cert: "server.crt",
  // key: "server.key",
});
```

Hostname resolves from options, then `HOSTNAME`, then `HOST`, then `localhost`.

## CLI

```bash
nst dev [dir]
nst start [dir]
nst replace-standalone [dir]
nst replace-standalone --dist-dir build
nst replace-standalone --no-copy-static
nst dev --https
nst dev --https --turbopack
nst start --https --cert server.crt --key server.key
```

## Testing

From the monorepo root (after `pnpm install` + `pnpm build`):

```bash
pnpm test            # unit/fixture tests (compose, listen, CLI, discovery, standalone find)
pnpm test:examples   # feature smoke on examples/next-15 and next-16 (dev + start)
pnpm test:all        # both
```

Examples under `examples/next-15` and `examples/next-16` share an HTTP-observable feature showcase (`server/`, `/demo/*`, `/healthz`, `/api/ok`). See each example README for the feature map.
