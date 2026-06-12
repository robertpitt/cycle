# Cycle

Cycle is a local-first, Git-backed issue and agent workflow application. It is
designed for planning, tracking, executing, and reviewing repository work without
requiring a hosted issue tracker.

The product model is Linear-inspired, but repository data lives with the
repository. Cycle stores issue documents, linked records, drafts, history, and
syncable metadata in Git objects and dedicated Git refs, while the desktop app
uses a local projection for fast UI reads.

## Status

Cycle is a private pnpm workspace under active development. The root
specifications describe the intended architecture and some package-level docs
describe current implementation details. Treat the app and package APIs as
pre-1.0.

## Quick Start

Prerequisites:

- Node.js with Corepack available
- pnpm `10.33.3`
- Git

Install dependencies:

```sh
corepack enable
pnpm install
```

Run the Electron desktop app:

```sh
pnpm desktop:dev
```

Run Storybook for the shared UI package:

```sh
pnpm storybook
```

## Common Commands

```sh
pnpm desktop:dev          # start the Electron app in development mode
pnpm desktop:build        # build the desktop app
pnpm desktop:start        # preview the built desktop app
pnpm desktop:typecheck    # typecheck @cycle/desktop

pnpm storybook            # run @cycle/ui Storybook on port 6006
pnpm storybook:build      # build static Storybook output

pnpm typecheck            # typecheck the workspace
pnpm lint                 # run oxlint over packages
pnpm lint:fix             # apply oxlint fixes
pnpm format               # format the repository with oxfmt
pnpm format:check         # check formatting
pnpm check                # typecheck, lint, and format-check
```

Package tests are exposed on packages that currently have test suites:

```sh
pnpm --filter @cycle/git test
pnpm --filter @cycle/git-db test
pnpm --filter @cycle/database test
pnpm --filter @cycle/usecases test
pnpm --filter @cycle/rpc test
pnpm --filter @cycle/desktop test
pnpm --filter @cycle/ui test
```

## Workspace Layout

```txt
packages/
  git/        Low-level Git services, schemas, repository checks, and backends.
  git-db/     Git-backed JSON document store built on Git objects and refs.
  database/   Repository registry, ticket domain writes, and read projection.
  contracts/  Canonical application schemas and usecase contract metadata.
  usecases/   Workflow execution, policy, validation, and orchestration.
  rpc/        Request/response protocol and client/server adapter layer.
  desktop/    Electron main, preload, renderer, IPC, and runtime composition.
  ui/         Shared React design system, pages, layouts, and Storybook.

vendor/
  effect-v4/  Vendored Effect v4 source, docs, and pattern references.
```

## Architecture

Cycle is organized as a layered Effect-first system:

```txt
@cycle/git
  -> @cycle/git-db
    -> @cycle/database
      -> @cycle/contracts
        -> @cycle/usecases
          -> @cycle/rpc
            -> @cycle/desktop

@cycle/ui is presentation-only and is consumed by the desktop renderer.
```

The durable repository storage path is:

1. `@cycle/git` provides Git object, ref, command, transport, and repository
   lifecycle services.
2. `@cycle/git-db` stores JSON documents as Git blobs, trees, commits, and refs
   under a dedicated namespace such as `refs/gitdb`.
3. `@cycle/database` opens repositories, writes Cycle domain documents to GitDB,
   and maintains a rebuildable local projection for UI-friendly queries.
4. `@cycle/usecases` validates and executes user-facing workflow commands.
5. `@cycle/rpc` adapts usecases to transport-safe request/response envelopes.
6. `@cycle/desktop` composes the runtime, IPC bridge, repository bootstrap, and
   React renderer.

Normal Git branches, `HEAD`, the index, and checked-out source files are not the
storage mechanism for Cycle issue data.

## Desktop App

The desktop package is built with Electron, electron-vite, React, React Router,
React Query, and `@cycle/ui`.

Useful entry points:

- main process: `packages/desktop/src/main/Main.ts`
- preload bridge: `packages/desktop/src/preload/index.ts`
- renderer app: `packages/desktop/src/renderer/App.tsx`
- IPC contracts: `packages/desktop/src/ipc/`
- desktop architecture notes: `packages/desktop/ARCHITECTURE.md`

The renderer talks to the main process through `window.cycleDesktop` and the RPC
client. It should not receive raw Electron, Node.js, filesystem, GitDB, or
database objects.

## Documentation

Start with these root docs:

- `CYCLE_SPEC.md`: product and system specification
- `SPEC.md`: cross-package architecture specification
- `DESKTOP_PRD.md`: desktop product requirements
- `LINEAR_FEATURES_PRD.md`: Linear-inspired feature requirements
- `LINEAR_FEATURE_PLAN.md`: feature implementation plan

Package-specific docs:

- `packages/git/README.md`
- `packages/git-db/README.md`
- `packages/git-db/ARCHITECTURE.md`
- `packages/database/SPEC.md`
- `packages/usecases/SPEC.md`
- `packages/desktop/README.md`
- `packages/desktop/ARCHITECTURE.md`
- `packages/ui/README.md`

## Development Notes

- This repository uses TypeScript with `moduleResolution: "NodeNext"` and
  source-first package exports that point at `src/**/*.ts` and `src/**/*.tsx`.
- Runtime capabilities are modeled with Effect services and layers.
- Public data crossing package boundaries should be schema-backed.
- Keep package boundaries strict: storage packages should not depend on
  workflow, transport, desktop, or UI packages.
- Keep `@cycle/ui` free of app runtime logic, persistence, Electron APIs, and
  data fetching.
- The vendored `vendor/effect-v4` tree is reference material for Effect v4
  patterns and should not be treated as a Cycle package.
