# @next-server-tools/standalone — Technical documentation

This document describes the architecture, request lifecycle, extension system, standalone replacement pipeline, and public APIs of `@next-server-tools/standalone`. For a short getting-started guide, see the [package README](../README.md).

## 1. Purpose and design goals

`@next-server-tools/standalone` is a **custom Node.js server for Next.js `output: 'standalone'`**, aimed at **self-hosted** deployments (Docker, Kubernetes, VMs). The design intent is soft separation of concerns: **Next owns rendering** (App Router / SSR / RSC); **this runtime owns the Node process** (listen, TLS, middleware onion, hooks, graceful shutdown). That keeps operational code portable across hosts instead of tying it to a single cloud platform’s server model.

Next.js states that standalone mode and a custom server cannot be used together (standalone emits its own `server.js` and does not trace yours). This package replaces that generated entry and keeps the same extension model in development.

| Next.js command | Package command | What runs |
| --- | --- | --- |
| `next dev` | `nst dev` | Library HTTP(S) server + `next({ dev: true }).getRequestHandler()` |
| standalone `server.js` / `next start` | `nst start` | Replaced `{distDir}/standalone/**/server.js` |

Production **requires** `output: 'standalone'`. Dev does not, but exists so local and prod share one `server/` layout.

**Goals**

1. **Standalone / self-host first** — lean traced deploy; library owns generated `server.js`.
2. **Next for rendering** — leave SSR/RSC/App Router to Next; put cross-cutting server concerns in `server/`.
3. **Portable Node ops** — healthz, auth gates, logging, TLS, shutdown work the same on any host that can run the standalone image.
4. **Extend via plugins** — middleware, hooks, and plugins instead of forking the server.
5. **Same extension model in dev and prod** — discovery layout is identical; only the loader differs (jiti vs esbuild bundle).
6. **Web-ish ports** — middleware sees `URL` / `Headers` ports with optional Node `.raw` escape hatches.
7. **Node.js 22+** — modern runtime; package engines require `>=22`.

**Non-goals**

- Not an Express/Koa framework (no routers, `res.cookie`, dual simultaneous listeners).
- Not a drop-in for “classic” custom servers that compile their own Express entry and skip `output: 'standalone'`.
- Not a Vercel/Edge/CDN runtime — this package targets standalone Node you run yourself.
- Not Next’s data-cache `cacheHandler` (stays on the Next side).

**Division of responsibility**

Prefer implementing request and lifecycle concerns in this package’s middleware/hooks/plugins (they run before Next’s handler). Next `middleware.ts` and `instrumentation.ts` remain available inside Next if a tool still expects them, but for typical standalone apps `server/` is the intended home for gates, logging, and process lifecycle.

| Concern | Intended home | Notes |
| --- | --- | --- |
| UI / SSR / RSC / App Router | Next | Forward with `await next()` after your middleware |
| Request gate / headers / healthz / access logs / auth | This package | Outside Next; short-circuit or `await next()` |
| Process startup, shutdown, request errors | This package (`server:*`, `request:error`, …) | Optional: keep `instrumentation.ts` only if a vendor setup still requires it |
| Data cache | Next `cacheHandler` | Not server middleware |

---

## 2. High-level architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ CLI (cli.ts)                                                │
│  dev | start | replace-standalone                           │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│ startCustomServer         │   │ replaceStandaloneServer     │
│ (server.ts) — typically   │   │ → copy standalone-server.js │
│ development               │   │ → bundle server-extensions  │
└─────────────┬─────────────┘   │ → optional static/public    │
              │                 └──────────────┬──────────────┘
              │                                │
              │                                ▼
              │                 ┌─────────────────────────────┐
              │                 │ startStandaloneServer       │
              │                 │ spawn replaced server.js    │
              │                 └──────────────┬──────────────┘
              │                                │
              ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│ createHttpApp (extension/http-app.ts)                       │
│  load/prepare extensions → compose middleware → Next        │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Node http / https.Server (listen.ts)                        │
│  + graceful shutdown (extension/shutdown.ts)                │
└─────────────────────────────────────────────────────────────┘
```

### Source layout

```text
src/
  cli.ts                 # bin entry
  boot-server.ts         # shared Node + Next boot (dev + standalone)
  server.ts              # startCustomServer → bootServer (jiti extensions)
  standalone-entry.ts    # thin CJS adapter → bootServer (typechecked via tsconfig.standalone.json)
  start-standalone.ts    # spawn replaced server.js
  replace-standalone.ts  # find + replace standalone entries
  listen.ts              # HOST/PORT/TLS resolution
  types.ts               # CustomServerOptions
  index.ts               # public exports
  extension/
    types.ts             # Context, middleware, hooks, plugins
    define.ts            # defineMiddleware / Hook / Plugin / Config
    discovery.ts         # filesystem discovery
    load.ts              # jiti loader (dev)
    bundle-extensions.ts # esbuild → server-extensions.cjs (prod)
    registry.ts          # merge + prepare (run plugin setup)
    compose.ts           # onion middleware
    context.ts           # Context / RequestPort / ResponsePort
    http-app.ts          # request pipeline + hook emission
    hooks.ts             # HookBus
    shutdown.ts          # SIGTERM / SIGINT
    logger.ts
    shim.ts              # define* only (esbuild alias target)
scripts/
  bundle-standalone.mjs  # esbuild standalone-entry → dist/standalone-server.js
```

### Package build

```bash
pnpm build   # inside packages/standalone
```

1. `tsc -b` — emits ESM under `dist/` (`"type": "module"`).
2. `scripts/bundle-standalone.mjs` — esbuild bundles `src/standalone-entry.ts` → `dist/standalone-server.js` (CJS, Node 22, `next` / `next/*` external).

Published files: `bin/`, `dist/`, `docs/`, and `llms.txt` (`package.json` `"files": ["bin", "dist", "docs", "llms.txt"]`). CLI `bin` points at `bin/nst.js` (stable wrapper → `dist/cli.js`) so workspace installs can link `nst` before the package is built.

---

## 3. Two runtime paths

### 3.1 Development — `startCustomServer`

Used by `nst dev` and the programmatic API.

1. Resolve listen options (`HOSTNAME` / `HOST` / `PORT` / TLS).
2. **Load extensions with jiti** (`loadProjectExtensions`) so users can keep TypeScript sources without a prebuild.
3. **Resolve `next` from the project directory** (`createRequire(projectDir/package.json)`), not from this package — required in monorepos where multiple Next majors are installed.
4. Call shared `bootServer` (see §3.2 / `boot-server.ts`): create Node server, `next({ dev, dir, hostname, port, httpServer, turbopack?, webpack? })`, `prepare()`, wire request + upgrade handlers through `createHttpApp`, listen, hooks, graceful shutdown.

Dev and standalone share that boot path; only extension loading and Next resolution differ. Upgrade is wired eagerly via `getUpgradeHandler()` (HMR / websockets). Bundler selection for `nst dev` is explicit: `--turbopack` / `turbopack: true` or `--webpack` / `webpack: true`. When neither is set, the installed Next version's programmatic default applies (webpack on Next 15 custom server; Turbopack on Next 16+). `next.config` `turbopack: { … }` only configures Turbopack after it is selected — it does not enable it.

### 3.2 Production standalone — replace + start

Requires `output: 'standalone'` in `next.config`.

```text
next build
  → {distDir}/standalone/**/server.js   (Next stock entry)
  → {distDir}/static, required-server-files.json, …

nst replace-standalone
  → overwrite each found server.js with dist/standalone-server.js
  → write server-extensions.cjs beside it (esbuild bundle of user files)
  → copy {distDir}/static + public into the standalone app dir (unless --no-copy-static)
  → optionally copy {dir}/ssl into the standalone app dir (--copy-ssl)

nst start
  → spawn node {standalone}/server.js with cwd = that directory
```

**Finding `server.js`:** `findStandaloneServerEntries` walks `{dir}/{distDir}/standalone`, skipping `node_modules` and nested `{distDir}` folders. A directory counts as an app root when it contains both `server.js` and a `{distDir}` subdirectory (supports monorepo nesting such as `.next/standalone/apps/web/server.js`).

**Standalone entry behavior** (`standalone-entry.ts` → `bootServer`):

1. `chdir` to the standalone app directory; `NODE_ENV=production`.
2. Resolve listen options (relative `CERT`/`KEY` resolve under `{cwd}/ssl` unless absolute — `start` absolutizes against the **project** dir before spawn).
3. Load Next config from `{distDir}/required-server-files.json` into `__NEXT_PRIVATE_STANDALONE_CONFIG` (so Next does not need `next.config.*` in the traced tree).
4. Load `./server-extensions.cjs` (or empty registry).
5. Call shared `bootServer` (same as dev): create Node server → `next({ …, httpServer })` → `prepare()` → `getRequestHandler()` / `getUpgradeHandler()` → middleware onion → listen → hooks → graceful shutdown.
6. Optional `KEEP_ALIVE_TIMEOUT` sets `server.keepAliveTimeout`.

---

## 4. Extension system

### 4.1 Primitives

| Primitive | Role |
| --- | --- |
| **Middleware** | Async onion `(ctx, next)`. May mutate context, short-circuit with `ctx.res.end`, or call `next()`. |
| **Error middleware** | `role: "error"` — runs when normal middleware throws. |
| **Hooks** | Ordered observers for server/request lifecycle events. |
| **Plugins** | `setup(api)` registers middleware, hooks, and services (`provide` / `get`). |
| **Config** | `server.config.*` — `shutdownTimeoutMs` plus optional inline plugins/middlewares/hooks. |

### 4.2 Discovery layout

```text
{projectDir}/
  server.config.ts|mts|js|mjs|cjs     # first match wins (order listed)
  server/
    plugins/*.ts|js|…
    middleware/*.ts|js|…
    hooks/*.ts|js|…
```

**Merge order** (later lists append; config object fields are assigned left-to-right):

1. Empty registry  
2. `server.config.*` → `config`  
3. Filesystem `middleware` / `hooks` / `plugins`  
4. Inline `config.middlewares` / `config.hooks` / `config.plugins`

**Filename order:** `^(\d+)[-_]` prefix sets default `order` when omitted (else `100`). Files sort by that order, then path.

Ignored: dotfiles, non-matching extensions, `.d.ts`, subdirectories.

### 4.3 Dev load vs prod bundle

| Mode | Mechanism | Notes |
| --- | --- | --- |
| Dev | **jiti** (`createJiti` + `jiti.import`) | Transpiles TS/ESM on the fly; `interopDefault: true` |
| Prod standalone | **esbuild** (`bundleProjectExtensions`) | Generates temp `_extensions-entry.mjs`, bundles to CJS `server-extensions.cjs`, `target: node22` |

Bundling aliases `@next-server-tools/standalone` → `dist/extension/shim.js` (only `define*` helpers) so user files can `import { defineMiddleware } from "@next-server-tools/standalone"` without pulling the full runtime / `import.meta` into the CJS bundle.

If no extension files exist, an empty registry CJS module is still written.

### 4.4 Plugin preparation

`prepareExtensions`:

1. Copy registry middlewares; register filesystem/config hooks on a `HookBus`.
2. Sort plugins by `order`, then `name`.
3. For each plugin, call `setup(api)` where `api` can:
   - `middleware({ name, order?, match?, role?, handler })`
   - `hook(name, handler, { order? })`
   - `provide(key, value)` / `get(key)` — process-scoped services on a `Map`
4. Return `{ middlewares, hooks, services, config }`.

Plugin-registered middleware is appended after filesystem middleware (then sorted by `order` at compose time).

### 4.5 `define*` helpers

```ts
defineMiddleware(handler)
defineMiddleware({ name, order?, match?, role? }, handler)
defineErrorMiddleware({ name?, order?, match? }, handler)  // default order 10_000
defineHook(name, handler, { order? })
definePlugin({ name, version?, order?, peerExtensionApi?, setup })
defineConfig({ shutdownTimeoutMs?, plugins?, middlewares?, hooks? })
```

Anonymous middleware/plugin names are auto-generated (`middleware:N`, `plugin:N`).

---

## 5. Request lifecycle

For each HTTP request, `HttpApp.handle`:

```text
createContext (id = randomUUID)
  → hooks: request:start
  → middleware onion (order ascending)
       … each may match(path) …
       → final:
            hooks: next:before
            flush ctx.res status/headers onto Node res
            nextHandler(req.raw, res.raw)
            hooks: next:after
  → hooks: response:sent
  → hooks: request:finish

on throw:
  → error middleware chain (if any); rethrow if all call next()
  → hooks: request:error
  → 500 "Internal Server Error" if headers not sent
```

### Middleware matching

- No `match` → always runs.
- String exact path, or prefix if `match` ends with `/**` (`/api/**` → `/api` and `/api/...`).
- `RegExp` tested against `ctx.req.url.pathname`.

### Short-circuit

Middleware that calls `await ctx.res.end(...)` and **does not** call `next()` never reaches Next. Calling `next()` multiple times throws.

### Before Next

Status and headers from `ctx.res` are copied onto the Node `ServerResponse` immediately before the Next handler so middleware can set headers that Next should see as already applied.

### Hooks catalog

| Hook | When | Payload |
| --- | --- | --- |
| `server:start` | Before `listen` | `{ runtime, log }` |
| `server:ready` | After listen + public URL set | `{ runtime, log }` |
| `server:shutdown` | After `server.close` (or timeout) | `{ runtime, log }` |
| `request:start` | Start of request | `{ ctx }` |
| `request:finish` | End of successful pipeline | `{ ctx }` |
| `request:error` | Unhandled error | `{ ctx, error }` |
| `next:before` | Immediately before Next | `{ ctx }` |
| `next:after` | Immediately after Next returns | `{ ctx }` |
| `response:sent` | After pipeline (before finish) | `{ ctx }` |

Hooks for a given name run sequentially, sorted by `order` then `name`.

---

## 6. Context API

```ts
type Context = {
  id: string;                 // request UUID
  req: RequestPort;
  res: ResponsePort;
  state: StateBag;           // Proxy bag with .set / .get
  log: Logger;
  config: RuntimeConfig;      // dir, hostname, port, https, dev, shutdownTimeoutMs
  runtime: RuntimeHandle;     // url?, dir, dev, get(serviceKey)
  timing: Timing;             // mark(name) → { end(), ms }
  trace: TraceContext;        // reserved (traceId/spanId currently unused by core)
  meta: { hitNext };
};
```

`meta.hitNext` starts `false` and becomes `true` when the request reaches the Next handler. Middleware that never calls `next()` leaves it `false`. Hooks such as `response:sent` / `request:finish` see the final value.

### RequestPort

- `method`, `url` (`URL`), `headers` (`Headers`)
- `raw` — Node `IncomingMessage`
- `text()` / `arrayBuffer()` — buffered body (lazy, shared promise)

URL origin prefers the runtime public URL once set; otherwise `https?://{hostname}:{port}` or `Host` header.

### ResponsePort

- `status` (number), `headers` (`Headers`)
- `writableEnded`
- `raw` — Node `ServerResponse`
- `end(body?)` — applies headers + status, ends once

Prefer ports over `.raw` for portability; use `.raw` for Node-only needs (e.g. response buffering proxies).

### Services

`runtime.get(key)` / plugin `provide` share a process-level `Map` — suitable for caches, clients, cert managers initialized in `server:start` or plugin `setup`.

---

## 7. Listen, TLS, and environment

Resolved by `resolveListenOptions` in `listen.ts`.

| Input | Resolution |
| --- | --- |
| Hostname | options → `HOSTNAME` → `HOST` → `localhost` |
| Port | options → `PORT` → `3000` |
| HTTPS | `https: true`, or env `HTTPS=1` / `true` |
| Force HTTP | `https: false`, or env `HTTPS=0` / `false` |
| Cert/key paths | Absolute, or relative under `{dir}/ssl` (defaults `server.crt` / `server.key`); used only when HTTPS is enabled |

Missing cert/key files when HTTPS is enabled throw at resolve time.

**Public URL** (`buildPublicUrl`): maps `0.0.0.0` / `::` to `localhost` for display; omits default ports 80/443.

**Standalone-only env**

| Variable | Effect |
| --- | --- |
| `NEXT_DIST_DIR` | Dist folder name inside standalone cwd (default `.next`); set by `start` |
| `KEEP_ALIVE_TIMEOUT` | Milliseconds for `server.keepAliveTimeout` |
| `__NEXT_PRIVATE_STANDALONE_CONFIG` | Set by standalone entry from `required-server-files.json` |

**Logging:** `DEBUG` enables debug-level logs from the built-in logger.

---

## 8. Graceful shutdown

`installGracefulShutdown` listens once for `SIGTERM` and `SIGINT`:

1. `server.close()` racing a timer of `shutdownTimeoutMs` (default `10_000` from config).
2. Emit `server:shutdown`.
3. `process.exit(0)`.

---

## 9. CLI reference

```bash
nst <command> [dir]

Commands:
  dev
  start
  replace-standalone

Options:
  -H, --hostname
  -p, --port
  --https
  --cert <path>
  --key <path>
  --turbopack            # nst dev only; force Turbopack
  --webpack              # nst dev only; force webpack
  --dist-dir <name>      # default .next
  --no-copy-static       # replace-standalone only
  --copy-ssl             # replace-standalone only; copy {dir}/ssl (off by default)
  -h, --help
```

| Command | Implementation |
| --- | --- |
| `dev` | `NODE_ENV=development`, `startCustomServer({ dev: true, turbopack?, webpack?, … })` |
| `start` | `startStandaloneServer` (spawn) |
| `replace-standalone` | `replaceStandaloneServer({ copyStatic, copySsl })` |

`[dir]` defaults to `cwd` and is resolved to an absolute path.

---

## 10. Programmatic API

Exported from `@next-server-tools/standalone` (`src/index.ts`):

### Servers

```ts
startCustomServer(options?: CustomServerOptions): Promise<http.Server | https.Server>
startStandaloneServer(options?: StartStandaloneOptions): Promise<void>
replaceStandaloneServer(dir | ReplaceStandaloneOptions): Promise<string[]>
findStandaloneServerEntries(projectDir?, distDir?): Promise<string[]>
```

### Listen helpers

```ts
resolveListenOptions(...)
createNodeServer(listen, { requestListener? })
buildPublicUrl({ hostname, port, https })
```

### Extensions

```ts
defineMiddleware / defineErrorMiddleware / defineHook / definePlugin / defineConfig
loadProjectExtensions(projectDir): Promise<ExtensionRegistry>
```

### Types

`Context`, `MiddlewareDefinition`, `HookDefinition`, `PluginDefinition`, `ServerUserConfig`, `ExtensionRegistry`, `HookName`, `Logger`, `RuntimeConfig`, `RuntimeHandle`, `RequestPort`, `ResponsePort`, `CustomServerOptions`, `StartStandaloneOptions`, `ReplaceStandaloneOptions`, `TlsUserOptions`, `ResolvedListen`, `AnyNodeServer`.

---

## 11. Comparison with classic Express custom servers

| Aspect | Classic Express (e.g. web-next) | @next-server-tools/standalone |
| --- | --- | --- |
| Prod entry | App-owned `build/server.js` | Replaced standalone `server.js` |
| `output: 'standalone'` | Often unused | Required for `start` |
| Routing | Express routers | Middleware `match` + short-circuit |
| Cookies / sessions | Express middleware | User middleware (no built-ins) |
| Dual HTTP+HTTPS | Possible (two `listen`s) | Single server |
| Dev TS | nodemon + swc/ts-node | jiti |
| Prod extensions | Compiled with app | esbuild → `server-extensions.cjs` |

Migration path for Express apps: enable standalone, move route handlers into `server/middleware` / plugins, drop the Express compile step, use `replace-standalone` in the build script.

---

## 12. Operational recommendations

**Minimal scripts**

```json
{
  "scripts": {
    "dev": "nst dev",
    "build": "next build && nst replace-standalone",
    "start": "nst start"
  }
}
```

**CDN / nginx sidecar** — static assets not served by Node:

```bash
nst replace-standalone --no-copy-static
```

**Local HTTPS** (cert files under `ssl/`):

```bash
nst dev --https
# or HTTPS=1 CERT=server.crt KEY=server.key
```

**HTTPS inside a standalone deploy image** — copy certs at replace time (off by default; skip when TLS is terminated elsewhere or secrets are mounted at runtime):

```bash
nst replace-standalone --copy-ssl
# then in the image / after chdir to standalone:
HTTPS=1 node server.js
```

**IPv6 all-interfaces bind** (common in containers):

```bash
HOSTNAME=:: PORT=3200 nst start
```

**Health checks** — implement as short-circuit middleware or keep Next App Router `/health` routes; the package does not ship a default probe.

---

## 13. Known limitations

1. **Single listener** — one host/port/protocol per process.
2. **No first-class response buffering** — HTML cache patterns must wrap `ctx.res.raw` themselves.
3. **No cookie helpers** on `Context`.
4. **`trace` fields** are reserved but not populated by the core.
5. **Custom WebSockets in dev** — if you add your own `server.on("upgrade")` handler, you must forward Next’s HMR path (via `getUpgradeHandler()` / pathname check) or you can break Fast Refresh. Stock usage does not need this; Next attaches HMR on the first request through `getRequestHandler()`.
6. **Multiple standalone entries** — `start` warns and runs the first found path only.
7. **Extension API version** — `runtime.extensionApiVersion` is `1`; `peerExtensionApi` on plugins is stored but not enforced yet.

---

## 14. Dependencies

| Package | Role |
| --- | --- |
| `jiti` | Runtime TS/ESM import for extension discovery in dev |
| `esbuild` | Bundle standalone server + user extensions for prod |
| `next` (peer `>=15`) | Request handlers |

---

## 15. Versioning notes

- Package version: see `package.json`.
- Extension API surface version: `RuntimeHandle.extensionApiVersion === 1`.
- Breaking changes to `Context`, hook names, or discovery paths should bump the package major and document migration in the README.
