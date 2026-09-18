# `#include <cpp>`

Learn C++ from zero to data structures. A browser-based IDE with graded practice
problems.

You write code in the browser; it compiles and runs against a real toolchain on
the host machine, and per-test results stream back as they happen. Each problem
lives in `problems/<id>/` exactly as shipped by its source — the platform adds a
`meta.json`, a `problem.md`, and a `tests/grader.cpp` beside the originals and
never rewrites them.

## Stack

- **Frontend** (`web/`): Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Monaco Editor
- **Backend** (`api/`): NestJS 11 on Fastify · ESM · `@swc-node/register`
- **Database** (optional): Supabase (Postgres + RLS). Without it, everything persists in localStorage.
- **Compile pipeline**: `make` / `cmake`, prefixed with `ccache`. Makefile problems use a custom fork-per-test grader harness; CMake problems use Catch2 + CTest with JUnit XML parsing. Output streams over Server-Sent Events.

## One-time setup

```bash
# 1. System deps (macOS)
brew install node ccache cmake

# 2. Install (npm workspaces — single install from root)
npm install

# 3. Env vars
cp api/.env.example api/.env       # defaults are fine for local dev
cp web/.env.example web/.env.local
# Optionally fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
# Without them the app runs in anonymous dev mode (localStorage only).

# 4. Supabase (optional)
# Create a project at supabase.com, then run the files in supabase/migrations/
# in filename order from the SQL Editor.
```

`GET /api/health` reports which of `ccache`, `make`, `cmake`, and a C++ compiler
were found on `PATH`, and the UI surfaces a banner when something is missing.
Only `ccache` is truly optional — without it every compile rebuilds from
scratch. `make` and `cmake` are each required by the problems that use them.

## Run

```bash
# Terminal 1
npm run dev -w api         # http://localhost:3001
                           # Swagger UI at /api/docs

# Terminal 2
npm run dev -w web         # http://localhost:3000
```

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Toolchain status + warnings |
| `GET /api/problems` | Sidebar list (id + title, sorted by `meta.order`) |
| `GET /api/problems/:id` | Statement, file contents, read-only files |
| `POST /api/problems/:id/run` | Build + run the entrypoint (SSE) |
| `POST /api/problems/:id/test` | Build + grade against `tests/` (SSE) |

Compile output lands in `.builds/`, the compiler cache in `.ccache/` — both at
the repo root, both gitignored, both relocatable via `BUILD_ROOT` / `CCACHE_DIR`.

## Tests

```bash
npm test                    # 293 api + 351 web
npm run build --workspaces  # tsc -p for api, next build for web
```

Everything runs on `node:test` — no test-runner dependency in either
package.

Every bug fix carries a regression test that was confirmed to fail before the
fix. The graders themselves are covered two ways: `sentinel-harness-contract`
pins the C++ harness's output tokens against the TypeScript parser that reads
them, and `per-problem-grader-uses-harness` keeps every problem on the shared
harness rather than a hand-rolled `main`.

## Layout

```
include-cpp/
├── package.json            Root — npm workspaces (api, web)
├── node_modules/           Single shared node_modules
├── api/                    NestJS backend
│   ├── src/
│   │   ├── main.ts         Fastify bootstrap, CORS, security headers, Swagger
│   │   ├── app.module.ts   Throttler, modules
│   │   ├── common/         Path resolution, toolchain detection, logging
│   │   ├── execution/      POST .../run | /test (SSE streaming)
│   │   ├── health/         GET /api/health (toolchain status)
│   │   └── problems/       GET /api/problems, GET /api/problems/:id
│   ├── test/               node:test specs
│   └── tsconfig.json
├── web/                    Next.js frontend
│   ├── app/                App Router pages + layouts
│   ├── components/         EditorPanel, Sidebar, OutputPanel, TopBar, StatusBar, etc.
│   ├── hooks/              useProblemEditor, useMonacoModels, useResizable, useSSE
│   ├── lib/                API client, types, Supabase client, storage, markdown
│   ├── public/sw.js        Service worker — cache-first static, build-ID-scoped HTML
│   └── test/               node:test specs (happy-dom + Testing Library)
├── problems/               Problem data (backend reads, never writes)
│   ├── _shared/            grader_harness.h (fork-per-test + sentinel emission)
│   ├── fizz-buzz/          Title-slug dirs: sources, Makefile, meta.json,
│   ├── word-frequency/     problem.md, tests/grader.cpp
│   └── POTD0/ … POTD64/    Older dirs kept under their original names
└── supabase/
    ├── migrations/         SQL schema (user_code, problem_status; ui_state table + RLS present, not yet wired — UI state currently persists to localStorage via web/lib/storage.ts)
    └── README.md
```

## Architecture

| Feature | Location |
|---|---|
| `ccache` on every compile | `makefile-runner.ts`, `cmake-runner.ts` |
| SSE streaming for compile/test output | `execution.controller.ts` |
| Sentinel-wrapped grader results | `_shared/grader_harness.h` + `sentinel.ts` |
| In-flight dedupe (reject concurrent runs) | `in-flight.ts` |
| CPU / memory / file-size / wall-clock limits | `resource-limits.ts` |
| CMake + Catch2 + JUnit XML parsing | `cmake-runner.ts` + `junit.ts` |
| Fork-per-test (crash isolation) | `_shared/grader_harness.h` |
| Rate limiting | `app.module.ts` (`@nestjs/throttler`) |
| Monaco model-swap (no remount on tab switch) | `useMonacoModels.ts` |
| Unified editor state | `useProblemEditor.ts` |
| Static cache-first, HTML stale-while-revalidate per build | `web/public/sw.js` |

Two throttlers are registered globally: `default` (10 requests/second) and
`exec` (8 per 10s, applied to `/run` and `/test`). Because `ThrottlerGuard`
iterates only the throttlers named at the root, a per-route `@Throttle` must
override **both** or the un-named one still applies — `problems-throttle.spec.ts`
guards that.

## Resource limits

Every compile and run is wrapped with `bash -c 'ulimit -t … -v … -f …; exec <cmd>'`,
plus a parent-side wall-clock kill on the detached process group.

- **`-t` (CPU seconds)** — reliable cap on CPU time.
- **`-f` (file size KB)** — prevents accidental disk-fill.
- **`-v` (virtual address space KB)** — address space, not RSS. macOS silently ignores `-v`; Linux enforces it. For real RSS isolation you'd want cgroups.

If tests fail with "allocation failed" errors on code that should fit in budget,
the `-v` cap is the first place to look.

## Authoring a new problem

1. Drop the source files into `problems/<title-slug>/` — lowercase, hyphenated,
   named after the problem itself.
2. Add `problem.md`: the statement verbatim, plus a short build/test note if the
   problem needs one. Nothing invented.
3. Add `meta.json`. `readOnlyFiles` and `order` are optional; `order` is what the
   sidebar sorts on, and a problem without it sorts to the end of the list and
   says so in the API's boot log:
   ```json
   {
     "title": "...",
     "buildType": "makefile",
     "editableFiles": ["foo.cpp"],
     "readOnlyFiles": ["foo.h", "main.cpp"],
     "entrypoint": "main",
     "order": 3
   }
   ```
   Every filename is validated as a bare name — no `/`, no `..`. `entrypoint`
   and both file lists reach the filesystem, so traversal there would read
   arbitrary files.
4. Write `tests/grader.cpp` using the harness:
   ```cpp
   #include "../foo.h"
   #include "grader_harness.h"

   GRADER_TEST("does the thing") {
       GRADER_ASSERT_EQ(foo(2), 4);
   }
   int main() { return grader::run_all(); }
   ```
   Also available: `GRADER_ASSERT`, `GRADER_ASSERT_NE`, `GRADER_ASSERT_TRUE`,
   `GRADER_ASSERT_FALSE`, `GRADER_FAIL`. Each `GRADER_TEST` runs in its own
   forked child, so a segfault fails one case instead of the whole run.
5. Update the `Makefile` `test` target to include the harness path:
   ```make
   SHARED_INCLUDE ?= ../_shared
   test: foo.cpp tests/grader.cpp
   	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) foo.cpp tests/grader.cpp -o test_runner
   	./test_runner
   ```

Use `CXX ?= clang++` (not `=`) so the backend's `ccache c++` override takes effect.

CMake problems (`"buildType": "cmake"`) skip the harness entirely: they build
with Catch2, run under CTest, and report through JUnit XML instead of sentinels.
`problems/POTD64/` is the working example.
