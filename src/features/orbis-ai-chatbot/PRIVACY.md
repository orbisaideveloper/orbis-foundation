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

The current Chatbot and every chat/learning endpoint remain inside verified
Admin authentication. Generic-user authentication and the separately deployed
public-user Chatbot are intentionally deferred.

Release management must later keep two distinct concepts: the Admin's working
version and the last verified version published for users. Promotion, rollback,
deployment, and public UI are deferred; this Task 2 module creates no release
state or inactive dashboard controls.

Capability contract: chat currently wires only allow-listed Termux system info
and file read (the latter retains explicit approval), configured Tavily search,
and the Ollama provider adapter. PDF writing/export has no implementation;
XLSX/PDF attachment helpers only transform browser files and are disabled from
chat transport; database table scripts are standalone maintenance utilities,
not a secured searchable Brain capability. None are advertised by the registry.
