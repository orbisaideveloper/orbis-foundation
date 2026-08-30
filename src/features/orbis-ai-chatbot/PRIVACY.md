# ORBIS AI Chatbot privacy boundary

The Chatbot is a separately deployable feature module that calls Foundation
contracts through `/api/chat`. Foundation remains responsible for orchestration,
capability discovery, provider adapters, policy, authorization, and approvals.
The Chatbot is not a model; Ollama and future providers are replaceable adapters.

Chat messages, conversational history, pending clarifications, personal-memory
summaries, and response-cache records are device-local. Persistence is opt-in
and partitioned by authenticated account ID, or by a device-generated anonymous
profile when no account is available. Declining consent keeps context only in
the current app session. Revoking consent stops subsequent writes.

The Admin-only Brain Test Log is also device-local. It stores message IDs plus
bounded operational metadata (provider, route, duration, delivery and outcome)
and resolves the full question/answer from the same local chat history only
when the Admin opens the Test Lab. It does not duplicate transcripts or write
raw content to server diagnostics, telemetry or a database. Clearing only Test
Logs preserves chat history; clearing a conversation removes its linked Test
Log entries so no orphaned records remain.

The browser implementation uses IndexedDB behind `ChatStorageManager`. Its
contract is intentionally independent of IndexedDB details so a future Android
implementation can use encrypted SQLite. The default logical budget is 500 MB,
with a warning at 80%. Cleanup is always user initiated; there is no automatic
deletion of pinned or important records.

Removing browser/app data or uninstalling the app removes local Chatbot history.
There is no backup. A future backup must be user-controlled and encrypted.

The server receives the bounded current request and limited conversational
context transiently in memory. It does not persist or log raw chat content.
Attachments are currently unsupported in both UI and API. The former automatic
server memory learner remains disabled.

Foundation text learning is a separate Admin-only pipeline and is off by
default, independently of device-history consent. The Admin explicitly asks to
preview the latest local chat message. The server rejects personal/secret input
before generation, validates the provider's generalized candidate, rejects
quoted or reversibly overlapping source text, and returns only the candidate
plus a short-lived signed approval token. Preview performs no database write.
Only a second explicit approval request can store the validated candidate in
`FoundationLearnedKnowledge`; that table contains compact text, category,
minimal tags, active state, timestamps, and a SHA-256 deduplication hash. It
contains no source chat, response, account identity, or personal memory.
Authenticated Admin list and delete operations expose only those safe fields.

Learning Loop Phase 1 is a separate, authenticated server-to-server feedback
path. It accepts only a bounded batch of opaque event IDs, the existing
deterministic Brain decision trace, a fixed outcome, and a fixed feedback code.
Unknown fields are rejected, so prompts, answers, account identity, locations,
free-text corrections, and provider output cannot enter the event store. An
event ID is idempotent: retries return the prior result without another write.
This phase collects metadata for later pattern review; it never changes a
Brain decision, invokes a provider, or makes an automatic knowledge update.

The current Chatbot and every chat/learning endpoint remain inside verified
Admin authentication. Generic-user authentication and the separately deployed
public-user Chatbot are intentionally deferred.

Release management must later keep two distinct concepts: the Admin's working
version and the last verified version published for users. Promotion, rollback,
deployment, and public UI are deferred; this Task 2 module creates no release
state or inactive dashboard controls.

Capability contract: chat currently wires only allow-listed Termux system info
and file read (the latter retains explicit approval), configured Tavily search,
and the Ollama provider adapter. Chat attachments remain rejected in both UI
and API.

Task 3C adds a separate, verified-Admin Foundation capability API. Its four
registered capabilities are allow-listed Foundation table search, bounded PDF
text reading, bounded XLSX reading, and bounded XLSX creation. Each operation
requires a short-lived one-time approval token bound to the exact Admin,
capability, and input. File bytes are supplied only to that dedicated endpoint,
processed transiently in memory, and never copied into chat context. Generated
XLSX bytes are returned as a no-store attachment response for direct download;
the server does not write output files or persist input/output in PostgreSQL,
Supabase Storage, telemetry, or chat history.

PDF creation is unavailable because no pinned PDF-writing implementation
exists. PDF/XLSX conversion is not implemented because no deterministic
structured conversion exists. Image inspection/editing is unavailable because
there is no safe local implementation or approved provider transport. The
status endpoint reports these states but the registry does not advertise them
as callable capabilities.
