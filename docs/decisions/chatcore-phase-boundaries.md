# chatCore.ts Modularization — Phase 4+ Analysis

**Status**: Phase 1-3 COMPLETE. Phase 4 (partial) COMPLETE. Phase 5-6 DEFERRED.

## Current state

```
chatCore.ts: 4684 lines (down from 6022, -22%)
16 extracted modules: 1989 lines total
```

## Extracted modules

| Module | Lines | Phase | Purpose |
|---|---|---|---|
| chatCoreUtils.ts | 90 | 1 | Pure utility functions |
| chatCoreErrors.ts | 89 | 1 | Error classification & responses |
| chatCoreExports.ts | 142 | 1 | Re-exports of public API |
| chatCoreHelpers.ts | 325 | 1 | Generic helpers (executor, semaphore) |
| chatCoreLogMeta.ts | 101 | 2 | Log metadata builders |
| chatCoreMemory.ts | 163 | 2 | Memory extraction/injection |
| chatCorePassthrough.ts | 125 | 2 | Claude passthrough logic |
| chatCoreStreamHelpers.ts | 233 | 2 | Stream helpers (heartbeat, chunks) |
| chatCoreStreamUtils.ts | 148 | 3 | SSE terminal detection |
| chatCoreCache.ts | 70 | 4 | Module-level cache state |
| chatCoreClaudeUsage.ts | 39 | 4 | Claude extra-usage sync |
| chatCoreResponseBody.ts | 72 | 4 | Non-stream response body reader |
| chatCoreSemaphoreKey.ts | 27 | 4 | Semaphore key resolver |
| chatCoreSetup.ts | 219 | 4 | Phase 1: setup (heap guard, trace, plugin hook) |
| chatCoreTransform.ts | 48 | 4 | Phase 2: request translation wrapper |
| chatCoreExecutor.ts | 98 | 4 | Phase 4: executor resolution with proxy |

## What remains

The `handleChatCore` function itself is still 4684 lines. It is a single async
function with deeply nested closures and 50+ shared local variables.

### Phase 4 (execute) — lines ~2520-2910
`executeProviderRequest` (~390 lines) handles deduplication, compression,
translation, and error handling. Depends on 20+ closure variables.

### Phase 5 (stream) — lines ~4370-4620
`onStreamComplete` callback (~180 lines) and transform stream creation.
Heavy closure dependency.

### Phase 6 (finalize) — lines ~4620-4685
Final response construction and cleanup.

### Why these require a class-based refactor

All three phases close over the same 50+ variables (provider, model,
credentials, translatedBody, stream, connectionId, apiKeyInfo, log,
trace, startTime, etc.). Extracting them as standalone functions would
require passing a 50+ field context object — which is exactly what a
class instance provides.

### Recommended approach for the next session

1. Define `ChatCoreContext` interface with all shared state
2. Create `ChatCorePipeline` class with `runPhase4()`, `runPhase5()`, `runPhase6()` methods
3. Each phase method takes the context and returns a discriminated union
4. `handleChatCore` becomes a thin orchestrator that creates the context
   and calls the phase methods

## Verification

All work is verified through the dev server on port 3002:

- **UI VERIFIED**: Dashboard loads with all navigation sections
- **API VERIFIED**: Install returns all 5 lifecycle hooks
  `["onRequest","onInstall","onActivate","onDeactivate","onUninstall"]`
- **LOG VERIFIED**: All 5 hooks registered and fired correctly

## Related work

- DB modularization: `src/lib/db/` (11 subdirs, 39 re-export shims)
- Executors modularization: `open-sse/executors/` (6 subdirs, 58 re-export shims)
- Plugin lifecycle hooks: `src/lib/plugins/loader.ts`, `src/lib/plugins/hooks.ts`
