# @cycle/desktop

`@cycle/desktop` is the Electron desktop application for Cycle. It combines an Effect-managed
Electron main process, a secure preload bridge, and a React renderer that consumes `@cycle/ui`.

The package is private and source-first inside the monorepo. The build is handled by
`electron-vite`, with separate entry points for main, preload, and renderer.

## Contents

- [Package Role](#package-role)
- [Run And Build](#run-and-build)
- [Runtime Architecture](#runtime-architecture)
- [Source Layout](#source-layout)
- [Main Process](#main-process)
- [Preload And IPC](#preload-and-ipc)
- [Renderer](#renderer)
- [Configuration](#configuration)
- [Security Defaults](#security-defaults)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)

## Package Role

Use this package for desktop-specific concerns:

- Electron app lifecycle and shutdown handling
- BrowserWindow creation and window supervision
- preload APIs exposed to the renderer through `window.cycleDesktop`
- IPC channel definitions and validation
- renderer bootstrapping, routes, and providers
- desktop packaging/build configuration

Keep reusable UI in `@cycle/ui`, persistence logic in storage packages, and cross-platform domain
logic in shared packages. Desktop code should wire those layers together rather than becoming the
owner of reusable product components or data models.

## Run And Build

From the repository root:

```sh
pnpm install
pnpm desktop:dev
```

Package-level commands:

```sh
pnpm --filter @cycle/desktop dev
pnpm --filter @cycle/desktop build
pnpm --filter @cycle/desktop preview
pnpm --filter @cycle/desktop start
pnpm --filter @cycle/desktop typecheck
```

Root aliases:

```sh
pnpm desktop:dev
pnpm desktop:build
pnpm desktop:start
pnpm desktop:typecheck
```

`dev`, `preview`, and `start` run an Electron install preflight before launching so the Electron
binary is available in local installs.

## Runtime Architecture

```txt
Electron main process
  src/main/Main.ts
    -> provides DesktopLive
    -> runs runDesktop()
    -> waits for app readiness
    -> registers IPC
    -> creates/focuses/destroys windows

Preload process
  src/preload/index.ts
    -> exposes window.cycleDesktop
    -> invokes typed IPC channels

Renderer process
  src/renderer/main.tsx
    -> mounts DesktopRendererApp
    -> provides React Query, ThemeProvider, and React Router
    -> renders @cycle/ui pages
```

The main process is modeled with Effect services and layers. This keeps Electron APIs behind small
interfaces that can be replaced in tests or composed differently as the app grows.

## Source Layout

```txt
src/
  index.ts              Public package barrel.
  ipc/                  Shared IPC channel names, request types, and renderer bridge types.
  main/                 Electron main program, app layer, IPC registration, and window service.
  platform/             Thin Effect services around Electron app/window/shell/process APIs.
  preload/              contextBridge implementation.
  renderer/             React renderer entry, router, screens, and HTML file.
  shared/               Runtime config service shared by main-layer code.
electron.vite.config.ts Main/preload/renderer build configuration.
```

Public exports are defined in `package.json`:

- `@cycle/desktop`
- `@cycle/desktop/ipc`
- `@cycle/desktop/main`
- `@cycle/desktop/platform`
- `@cycle/desktop/renderer`
- `@cycle/desktop/shared`

## Main Process

The executable entry is `src/main/Main.ts`:

```ts
import { Effect } from "effect";
import { DesktopLive } from "./AppLayer.ts";
import { runDesktop } from "./MainProgram.ts";

const main = Effect.scoped(runDesktop()).pipe(Effect.provide(DesktopLive));

Effect.runPromise(main).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
```

`runDesktop()` performs the runtime sequence:

1. wait for Electron `app.whenReady()`
2. register desktop IPC handlers
3. create the main window
4. supervise activate/shutdown lifecycle behavior
5. destroy windows during shutdown

`DesktopLive` composes these services:

- `ElectronAppLive`, backed by Electron `app`
- `ProcessLifecycleLive`, observing process-level failures
- `BrowserWindowsLive`, backed by Electron `BrowserWindow`
- `DesktopConfigLive`, deriving renderer/preload paths and development mode
- `DesktopWindowLive`, creating and supervising the main Cycle window
- `ElectronShellLive`, wrapping Electron shell APIs

## Preload And IPC

Shared IPC contracts live in `src/ipc/Channels.ts`.

The current bridge type is:

```ts
type CycleDesktopBridge = {
  readonly openExternal: (targetUrl: string) => Promise<void>;
  readonly platform: NodeJS.Platform;
};
```

The preload script exposes the bridge:

```ts
contextBridge.exposeInMainWorld("cycleDesktop", desktopBridge);
```

Renderer usage:

```ts
await window.cycleDesktop?.openExternal("https://example.com");
```

Main-process IPC registration validates:

- the sender frame exists
- the sender frame is not destroyed
- the request comes from the top frame
- the payload has the expected shape
- external URLs use `http:`, `https:`, or `mailto:`

Add new IPC APIs by updating both sides of the contract:

1. add the channel name, request/response types, bridge type, and type guards in `src/ipc/`
2. expose a preload method in `src/preload/index.ts`
3. register and validate the handler in `src/main/DesktopIpc.ts`
4. consume the method from renderer code through `window.cycleDesktop`

## Renderer

The renderer app is in `src/renderer/App.tsx`.

It imports `@cycle/ui/styles.css`, creates a React Query client, wraps routes in
`ThemeProvider`, and renders a hash router:

```tsx
export const DesktopRendererApp = () => (
  <QueryClientProvider client={rendererQueryClient}>
    <ThemeProvider className="min-h-screen" mode="system">
      <RouterProvider router={rendererRouter} />
    </ThemeProvider>
  </QueryClientProvider>
);
```

Current routes:

- `/` renders `WorkspaceScreen`
- `*` renders `NotFoundScreen`
- route errors render `RouteErrorScreen`

`WorkspaceScreen` currently delegates to `WorkspaceAppShellPage` from `@cycle/ui/pages`.

## Configuration

`DesktopConfigLive` derives runtime configuration from the built main-process file location and the
optional `ELECTRON_RENDERER_URL` environment variable.

| Field | Description |
| --- | --- |
| `mode` | `development` when `ELECTRON_RENDERER_URL` is set, otherwise `production` |
| `preloadScript` | path to the built preload script |
| `rendererIndexHtml` | path to the built renderer HTML file |
| `rendererUrl` | development server URL, if configured |

`electron-vite` provides `ELECTRON_RENDERER_URL` during development. When it is absent, the window
loads the built renderer HTML file.

Renderer dev-server configuration:

```txt
host: 127.0.0.1
port: 5173
strictPort: true
```

## Security Defaults

`secureWebPreferences()` enforces secure BrowserWindow defaults:

- `allowRunningInsecureContent: false`
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`

Desktop IPC should keep following these rules:

- expose only narrow preload methods
- validate all renderer input in the main process
- prefer serializable request/response payloads
- never expose raw Electron, Node.js, filesystem, or shell objects to the renderer
- keep URL and path opening behind allowlisted handlers

## Development Workflow

For renderer UI work:

1. implement reusable UI in `@cycle/ui`
2. verify it in Storybook
3. consume it from desktop screens/routes
4. run the desktop app with `pnpm desktop:dev`

For main-process work:

1. add or update a platform service interface if Electron access needs to be abstracted
2. implement the live layer in `src/platform/*Live.ts`
3. compose it in `src/main/AppLayer.ts`
4. keep side effects inside Effect programs
5. run `pnpm desktop:typecheck`

For IPC work:

1. define the contract in `src/ipc`
2. validate at the main-process boundary
3. expose a minimal preload method
4. call it from renderer code through `window.cycleDesktop`

## Troubleshooting

If Electron fails to launch, run the install preflight directly:

```sh
pnpm --filter @cycle/desktop electron:install
```

If the renderer does not load in development, confirm that the Vite renderer server is running on
`http://127.0.0.1:5173` and that `ELECTRON_RENDERER_URL` is set by `electron-vite`.

If a window opens blank in production/preview, run:

```sh
pnpm --filter @cycle/desktop build
pnpm --filter @cycle/desktop preview
```

If TypeScript cannot find Electron or Vite types, run:

```sh
pnpm install
pnpm --filter @cycle/desktop typecheck
```
