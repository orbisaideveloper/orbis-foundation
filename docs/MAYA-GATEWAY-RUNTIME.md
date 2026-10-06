# Maya canonical backend gateway

Status: backend route and restricted provider service implemented; live use
remains unavailable until Admin capability authorization and origins are wired.
Gateway source is committed at `a35dc66527c7295ce6b33be9528385d73c264e38`
and was observed in the Foundation production deployment on 2026-10-05.
This is not a complete Maya release, live provider verification or Admin integration.
See MIGRATION-CHECKPOINT-20261006.md for migration and runtime evidence.

`bridge.cjs` mounts `/api/maya` before its general CORS and JSON handlers.
POST `/api/maya/request` accepts the existing `maya.v1` contract. The dedicated
boundary requires an Origin exactly listed in server `MAYA_ALLOWED_ORIGINS`.
No origin is enabled by default, including localhost. OPTIONS is supported.
Maya has a separate 32 KiB parser and no-store responses.

Existing `requireAuthenticatedUser` verifies shared Supabase tokens. No Admin
credentials are required for public users. Authentication does not establish
Maya entitlement: a separate `authorizeCapability` adapter must return exactly
true for the verified auth user ID, project ID `orbis-maya` and capability.
The canonical mount intentionally supplies no adapter while Admin is under
development. Consequently no public provider request can start yet. Do not
replace the adapter with unconditional true or client-controlled metadata.
The eventual adapter must read Admin-controlled membership/capability policy;
network failure or missing membership must deny access.

MayaService uses existing AIProviderManager.generateChat and ModelRouter. It
does not dispatch AIChatService's Brain/repository execution flow. Server-owned
prompts forbid tool execution and fabricated astrology facts. Provider output
must be valid strict JSON; the manager's existing validateResponse hook performs
validation before selecting a successful provider, allowing normal fallback.
No database, learning repository, conversation archive or content log is used.
Provider retention remains a separate provider-selection requirement.

Default limits: 10 valid requests per user per minute, 1000 bounded user buckets,
one concurrent policy/provider operation per user and 20 globally. Expired
buckets are removed. Policy timeout is 8 seconds; HTTP provider deadline is
60 seconds, each existing manager provider attempt receives a 15-second timeout.
The HTTP deadline does not itself cancel underlying provider work; the concurrency
slot stays reserved until provider work settles. Limits are process-local;
multi-instance deployment requires shared limit enforcement before scaling.

Success: `{ version, success: true, capability, language, result }`.
Gateway failures: `{ version, success: false, error: { code } }` with controlled
codes and HTTP 400/401/403/404/413/415/429/503/504. The existing authentication
middleware retains its existing safe 401/503 error shape; Maya client integration
must normalize that shape as well. Raw provider errors are never returned.

Astro remains unavailable pending the deterministic calculation contract.
Dream contract validation ensures shape, not cultural/historical correctness;
curated interpretation sources and product review remain required.

Targeted tests use fake authentication, authorization and provider responses.
They do not verify live Supabase, Admin or Hugging Face credentials. Owner runs
targeted tests locally without coverage; full Linux/quality checks remain owner
workflow. No automatic commit, push or deployment is part of the apply script.
