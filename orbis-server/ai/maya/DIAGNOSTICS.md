# Maya local diagnostics

Each gateway request gets a server-generated X-Request-ID. Correlation uses AsyncLocalStorage, including provider fallback attempts and work that settles after an HTTP timeout. No user identity is recorded.

Events cover gateway start/finish, authenticated boundary, central policy HTTP status and decision, generation, Hugging Face model attempt/status/response metadata, JSON/schema/chart consistency rejection, and final error phase. General Foundation provider calls outside a Maya request are not written to this log.

Only fixed allowlisted events, known model identifiers/error codes/reasons and bounded numeric metadata are recorded. Never record tokens, headers, URLs, request bodies, transcripts, names, birth data, chart facts or raw provider output. Unknown model IDs become `other`; unknown errors become `UNKNOWN`.

Local storage: ~/.config/orbis/maya-diagnostics/events.jsonl. Owner-private directory/files, 512 KiB rotation threshold, current file plus three backups (approximately 2 MiB total). No database logging, remote log upload, billing or new dependency. Disk failures do not fail requests. Tests suppress runtime logging; filesystem behavior is tested in temporary directories.

Authorization denies only on a matching explicit allowed:false policy result. Non-2xx, transport errors, malformed/mismatched policy replies fail closed as unavailable; aborted policy requests become timeout. Access is never granted during an outage.

Run the supplied ORBIS-MAYA-DIAGNOSTICS.sh --report after reproducing a failing question. The report re-filters the last 150 events and adds gateway health plus relevant source hashes; it never copies the raw gateway log. It can be shared for diagnosis. Log export is local/manual.

Provider or validation success is not certification of astronomical or interpretive accuracy. Full Linux/Sonar gates remain separate.
