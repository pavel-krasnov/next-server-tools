# next-server-tools

pnpm monorepo for **self-hosted** Next.js tooling: keep Next focused on rendering, and own the Node server / ops layer yourself (portable across Docker, Kubernetes, and VMs).

## Packages

| Package | Description |
| --- | --- |
| [`@next-server-tools/standalone`](./packages/standalone) | Standalone Node server for Next — replace generated `server.js`; Next keeps SSR/RSC, you own middleware/hooks/plugins |

## Structure

```
packages/standalone    # @next-server-tools/standalone — custom standalone server
examples/next-15   # Next.js 15 feature showcase
examples/next-16   # Next.js 16 feature showcase (same server/)
```

## Requirements

- Node.js 22+
- pnpm 11+

## Setup

```bash
pnpm install
pnpm build
```

## Examples

```bash
pnpm dev:15
pnpm build:15
pnpm start:15
```

Same pattern for `16`.

Both examples include the full extension showcase under `server/` (middleware match/error, hooks, plugins, `/demo/*`, `/healthz`, `/api/ok`).

## Tests

```bash
pnpm test            # unit tests
pnpm test:examples   # example feature smoke (15/16, dev + start)
pnpm test:all
pnpm check           # Biome
```

- Quickstart / extension API: [`packages/standalone/README.md`](./packages/standalone/README.md)
- Architecture & internals: [`packages/standalone/docs/TECHNICAL.md`](./packages/standalone/docs/TECHNICAL.md)
