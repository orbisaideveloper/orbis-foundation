# Maya gateway: first contract increment

Status: this document describes the first contract increment. The subsequent
restricted HTTP gateway is documented in MAYA-GATEWAY-RUNTIME.md. Gateway source
is committed at `a35dc66527c7295ce6b33be9528385d73c264e38` and was observed deployed
on Foundation main on 2026-10-05. Live Maya AI, membership and full account
integration remain unverified/disabled. See MIGRATION-CHECKPOINT-20261006.md.

## Existing boundaries inspected

The canonical backend is `orbis-server/bridge.cjs`. Existing `/api/chat` is
Admin-only. AIChatService can dispatch privileged Brain/repository capabilities;
Maya public requests must not enter that unrestricted command path. Reuse
Foundation AIProviderManager and its ModelRouter/provider fallback through a
restricted Maya service boundary. Do not duplicate provider adapters or expose
provider secrets. Add the eventual route to the canonical backend only.

## Version 1 inputs and results

Every accepted input has `version: "maya.v1"`, an allowlisted `capability`,
`language: "bn" | "en" | "hi"` and strict capability-specific `input`.
The language is the requested response language derived from user input, not
necessarily the interface preference. Unsupported languages currently fail
validation; expanding UI languages is a separate contract increment.

Dream input: required `dream`, optional `title`, `context`, `emotion`.
Dream result: `symbols`, `themes`, `emotions`, `interpretation`,
`reflectionQuestions`. The first three and reflectionQuestions are bounded
nonempty string arrays. This shape validates structure, not historical accuracy.
Source-aware cultural interpretation and evidence review are required before
the Dream product is complete. Interpretation remains reflective content,
not scientific certainty, a guaranteed prediction or a diagnosis.

Chat input: bounded alternating user/assistant `messages`, starting and ending
with the user. No client system prompts, tool calls, account IDs or extra fields.
Chat result: `{ reply: string }`. Context is supplied from local device history.

Astro capability is reserved but rejected with `MAYA_ASTRO_NOT_READY`. The
approved deterministic engine and versioned facts/provenance contract must be
implemented before accepting calculated chart data. AI must not produce chart
positions, houses or aspects. Interpretation remains separate from calculations.

Requests are limited to 32 KiB UTF-8 JSON and results to 48 KiB. Text has separate
character bounds. Contract validators do not authenticate or authorize users.

## Implemented restricted gateway and remaining wiring

- Server-verified shared Supabase token; separate Admin-controlled Maya
  capability authorization, with unavailable authorization denied.
- Explicit origin allowlist, public-user rate/concurrency limits and deadlines.
- Server-owned prompts, response validation before delivery, Foundation fallback.
- No privileged repository tools, accounting workspace creation, conversation
  archive, raw audio storage, prompt logging or automatic learning capture.
- Safe versioned error responses and contract/integration tests.

The HTTP/parser/origin/rate/provider boundaries below are implemented in the
restricted runtime. The real Admin authorization adapter and live end-to-end
verification remain pending; prepared source alone does not enable requests.

## Current owner directions

Home/introduction remains accessible before login. Maya signup uses email and
a new password. Name, password confirmation, profile fields, OTP and signup
verification are not mandatory product steps. Google and Guest entry are
excluded from the current scope. Forgot-password uses email recovery/reset;
session restoration and logout are required. Supabase Auth owns credentials
and sessions. Admin owns canonical UUIDv7 identity and membership; an ordinary
signup must never automatically grant owner privileges. Deployment Auth
configuration and the complete Maya identity/membership flow still require live
verification/integration. Maya already contains an interim shared Auth/password UI;
that UI is not proof of Admin membership or live AI authorization.
DOB/time/place are requested progressively when relevant. Foundation Accounting
is not the Maya account flow. Personal Dream/Astro/Chat history remains
device-local (PWA IndexedDB, later Android app-private storage).

The Maya project workspace belongs in Admin, following Foundation's real
dashboard organization. Development and Public views must use isolated releases:
development edits or failures must not disturb the pinned public release.
Publishing requires verification, release history and rollback. Before the first
publish, Public has no release. This gateway increment does not implement those
dashboard or deployment boundaries.

## Validation workflow

Owner runs the targeted Vitest file in Termux, then existing Foundation quality
workflow as appropriate. Do not claim full certification from contract tests.
Do not rerun Maya coverage for this Foundation-only increment. A single finished
report must include all executed checks and their final exit status.
