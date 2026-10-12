# Foundation Bengali example bank

Owner-approved 2026-10-07: improve Bengali intent understanding across all
products using curated language examples, with no duplicate transcripts.

Canonical data: orbis-server/ai/bengali/examples.json. Each entry has stable id,
intent, required context, variants, meaning, expected response behavior, source
and candidate/approved status. Five seed intent groups paraphrase the owner's
reviewed discussion; they are language guidance, not domain facts.

During any owner project work, propose useful new examples or corrections.
Group same-purpose variants in one entry. Do not automatically write every
conversation, promote user praise to factual verification, or infer authorization
from a phrase alone. Human review must approve candidates before retrieval or
training export. The owner authorized curation of their own discussion; other
users' conversations are excluded unless separately authorized and anonymized.
Never include identifiers, birth details, account data, credentials or raw audio.
Cross-chat ChatGPT memory and repo access are not guaranteed: this document is
the durable workflow, not a background service or automatic conversation feed.

Runtime: Foundation AIChatService provider fallback and Maya messages retrieve
up to 3 approved matching examples from the latest Bengali user message. This
first version uses normalized phrase matching, not semantic embeddings; it
adds guidance without changing Brain routing, policies, permissions or model
weights. Unmatched questions continue through the existing path.

Offline export (choose a NEW private filename):
node orbis-server/ai/bengali/export-training.cjs OUTPUT.jsonl

Export is a candidate training dataset, not a completed training job. Further
review, licensing, model choice, model-specific formatting, and evaluations are
needed. Keep all variants of one intent in the same train/evaluation partition
to avoid leakage; evaluate unseen phrases and speakers. Do not claim improvement
percentages or automatically learn from provider output.

Current patch tests run on owner Termux. Full certification and live behavior
remain pending until the combined report and manual examples are reviewed.

## Paired feedback — 2026-10-07
Keep selected anonymized user/context/assistant-answer pairs, with later corrections and feedback provenance. No correction is a weak preference signal, not factual validation. Such pairs remain candidate and are excluded from runtime retrieval and approved training export until reviewed. Explicit UI instructions can independently be approved as intent examples. This is curated repository work; no automatic cross-chat ingestion or weight update is implied.
