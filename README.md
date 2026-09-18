# `#include <cpp>`

Learn C++ from zero to data structures. A browser-based IDE with graded practice problems and video lessons.

Each problem lives in `problems/<id>/` exactly as shipped by its source, with an added `meta.json`, `problem.md`, and `tests/grader.cpp`. The Problem of the Day (POTD) set is one of the problem collections served by the platform.

## Stack

- **Frontend** (`web/`): Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · Monaco Editor
- **Backend** (`api/`): NestJS 11 on Fastify · ESM · `@swc-node/register`
- **Database** (optional): Supabase (Postgres + RLS). Without it, everything persists in localStorage.
- **Compile pipeline**: `make` / `cmake`, prefixed with `ccache`. Makefile problems use a custom fork-per-test grader harness; CMake problems (e.g. POTD64) use Catch2 + CTest with JUnit XML parsing. Output streams over Server-Sent Events.

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
# Create a project at supabase.com, then run supabase/migrations/0001_init.sql
# in the SQL Editor to create the tables.
```

## Run

```bash
# Terminal 1
npm run dev -w api         # http://localhost:3001

# Terminal 2
npm run dev -w web         # http://localhost:3000
```

## Layout

```
include-cpp/
├── package.json            Root — npm workspaces (api, web)
├── node_modules/           Single shared node_modules
├── api/                    NestJS backend
│   ├── src/
│   │   ├── main.ts         Fastify bootstrap + CORS
│   │   ├── app.module.ts   Throttler, modules
│   │   ├── common/         Path resolution, toolchain detection
│   │   ├── execution/      POST .../run | /test (SSE streaming)
│   │   ├── health/         GET /api/health (toolchain status)
│   │   └── problems/       GET /api/problems, GET /api/problems/:id
│   ├── test/               node:test unit tests (27 tests)
│   └── tsconfig.json
├── web/                    Next.js frontend
│   ├── app/                App Router pages + layouts
│   ├── components/         EditorPanel, Sidebar, OutputPanel, TopBar, StatusBar, etc.
│   ├── hooks/              useProblemEditor, useMonacoModels, useResizable, useSSE
│   └── lib/                API client, types, Supabase client, storage, lang utils
├── problems/               Problem data (backend reads, never writes)
│   ├── _shared/            grader_harness.h (fork-per-test + sentinel emission)
│   └── POTD0/ ... POTD64/  source files, Makefile/CMakeLists, meta.json, problem.md, tests/
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

## Resource limits

Every compile and run is wrapped with `bash -c 'ulimit -t … -v … -f …; exec <cmd>'`, plus a parent-side wall-clock kill on the detached process group.

- **`-t` (CPU seconds)** — reliable cap on CPU time.
- **`-f` (file size KB)** — prevents accidental disk-fill.
- **`-v` (virtual address space KB)** — address space, not RSS. macOS silently ignores `-v`; Linux enforces it. For real RSS isolation you'd want cgroups.

If tests fail with "allocation failed" errors on code that should fit in budget, the `-v` cap is the first place to look.

## Authoring a new problem

1. Drop the source files into `problems/POTDxx/`.
2. Add `problem.md` with the full statement.
3. Add `meta.json`:
   ```json
   {
     "title": "...",
     "buildType": "makefile",
     "editableFiles": ["foo.cpp"],
     "readOnlyFiles": ["foo.h", "main.cpp"],
     "entrypoint": "main"
   }
   ```
4. Write `tests/grader.cpp` using the harness:
   ```cpp
   #include "../foo.h"
   #include "grader_harness.h"

   POTD_TEST("does the thing") {
       POTD_ASSERT_EQ(foo(2), 4);
   }
   int main() { return potd::run_all(); }
   ```
5. Update the `Makefile` `test` target to include the harness path:
   ```make
   SHARED_INCLUDE ?= ../_shared
   test: foo.cpp tests/grader.cpp
   	$(CXX) $(CXXFLAGS) -I$(SHARED_INCLUDE) foo.cpp tests/grader.cpp -o test_runner
   	./test_runner
   ```

Use `CXX ?= clang++` (not `=`) so the backend's `ccache c++` override takes effect.
