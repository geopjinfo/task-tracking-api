# Architecture decisions

This is the single public decision register. Each accepted record states the problem, considered alternatives, selected decision, and consequences. Detailed working deliberation remains outside the repository. HLD, LLD, database design, and API design are normative for implementation detail.

## Modular monolith

**Status:** Accepted

**Context:** The system has multiple business capabilities and external integrations but must remain deliverable and operable as an assignment-sized service.

**Alternatives:** Independent microservices; an unstructured layered application; modular monolith.

**Decision and rationale:** Use one deployment with explicit feature modules and inward dependencies. It gives testable ownership boundaries without distributed transactions and operational overhead.

**Consequences:** Bootstrap composes all modules. Modules communicate through typed services/ports and cannot query another module's collection. Extraction remains possible but is not promised to be automatic.

## MongoDB with repository boundaries

**Status:** Accepted

**Context:** The assignment selects MongoDB while requiring consistency, indexing, and a credible SQL migration boundary.

**Alternatives:** Mongoose/ODM domain models; native MongoDB driver behind repository ports; SQL-first persistence.

**Decision and rationale:** Use the native driver behind typed repository and transaction ports, UUIDv7 strings, top-level collections, and explicit references. A replica set enables required multi-document transactions without ODM leakage.

**Consequences:** Mappers and indexes are explicit and require more code. MongoDB remains the durable source of truth. A SQL migration replaces adapters and database-specific queries while contract tests remain reusable.

## Short access tokens and rotating refresh sessions

**Status:** Accepted

**Context:** Stateless access tokens alone cannot support reliable logout, refresh replay response, or server-side session revocation.

**Alternatives:** Long-lived bearer JWT; opaque server session only; short JWT plus persistent rotating refresh session.

**Decision and rationale:** Issue 15-minute signed access JWTs and opaque refresh tokens stored only as hashes. Rotate refresh tokens atomically and revoke the family on reuse. Use an HttpOnly, SameSite cookie and Secure in HTTPS environments. Refresh and cookie logout require an exact `Origin` match to `PUBLIC_URL`; logout-all is bearer-authenticated and revokes every refresh session for the user.

**Consequences:** Refresh/logout need persistence and a CSRF control. JWT verification checks issuer, audience, algorithm, expiry, subject, and session claim. Access tokens remain valid until their short expiry unless an additional denylist is introduced.

## Redis is disposable

**Status:** Accepted

**Context:** Distributed rate limiting and multi-instance SSE fan-out need shared low-latency coordination, but Redis Pub/Sub is not durable.

**Alternatives:** In-process counters/events; Redis as notification storage; Redis only for disposable coordination.

**Decision and rationale:** Use Redis for expiring rate/quota counters and live Pub/Sub hints only. Keep tasks, membership, notifications, usage records where required, and outbox events in MongoDB.

**Consequences:** Redis loss cannot lose business history. Authentication limits fail closed; normal durable operations remain available where safe. Reconnected clients reconcile through REST.

## Private object storage

**Status:** Accepted

**Context:** Attachments must remain private without routing large object bodies through the application process.

**Alternatives:** Public bucket URLs; API-proxied uploads/downloads; private S3-compatible storage with signed URLs.

**Decision and rationale:** Use MinIO locally and an S3-compatible `ObjectStorage` port with private objects and short-lived signed upload/download URLs after authorization.

**Consequences:** Upload is a two-step eventually consistent workflow. Confirmation verifies metadata before readiness; cleanup handles stale records/orphans. Current membership is checked again for downloads.

## REST plus SSE

**Status:** Accepted

**Context:** Users need live server-to-client notifications, while all collaboration mutations already use REST and no bidirectional realtime protocol is required.

**Alternatives:** Polling only; WebSockets/Socket.IO; REST plus SSE.

**Decision and rationale:** Keep REST authoritative for mutation, inbox, and read state; add authenticated SSE for best-effort live delivery. This matches the one-way flow with less protocol and scaling complexity.

**Consequences:** Streams use heartbeats, connection caps, teardown, and user-specific Redis channels. SSE has no replay guarantee; clients fetch missed durable notifications after reconnect. WebSockets remain deferred.

## Provider ports and explicit AI approval

**Status:** Accepted

**Context:** AI and email providers are external, failure-prone, credentialed boundaries and must not infect application/domain contracts.

**Alternatives:** Provider SDKs directly in controllers; provider-neutral ports; omit integrations.

**Decision and rationale:** Define `AIProvider` and `MailerPort`, implement OpenRouter behind validated HTTP and Mailpit/SMTP locally, and keep provider/model configuration in validated environment settings. AI output is a suggestion requiring explicit user persistence.

**Consequences:** Deterministic tests mock every provider outcome. Secrets and raw responses are redacted. Invitation persistence survives email failure and delivery retries through durable intent. The invitation URL is removed after success or terminal failure. SMTP delivery is at-least-once across a process crash; a stable message ID is supplied for provider-side deduplication. AI endpoints enforce access, bounds, quota, timeout, and output validation.

## Backend-neutral observability

**Status:** Accepted

**Context:** The service needs correlated diagnostics without making one monitoring vendor a runtime dependency.

**Alternatives:** Console text logs; direct Loki/vendor clients; JSON logs plus OpenTelemetry standards.

**Decision and rationale:** Use Pino JSON logs and `AsyncLocalStorage` correlation by default. Use optional OpenTelemetry traces/metrics exported with OTLP. Loki/Grafana/Tempo/Prometheus run only in an optional local profile.

**Consequences:** Application code contains no Loki-specific client. Export failure cannot fail business requests. Sensitive/high-cardinality data is excluded, and instrumentation overhead must be bounded and measurable.

## Transactional outbox with bounded leases

**Status:** Accepted

**Context:** A business mutation and its notification/email side effects cannot be committed atomically across MongoDB, Redis, and SMTP.

**Alternatives:** Publish after database commit; synchronous provider call inside request/transaction; transactional outbox.

**Decision and rationale:** Write typed delivery intent in the same MongoDB transaction as business state. A worker uses bounded leases, retries, recipient policy, and unique `eventId:recipientId` delivery keys before best-effort Redis publication.

**Consequences:** Processing is at-least-once and handlers must be idempotent. Worker lag is observable. Expired leases recover from crashes. Durable inbox and REST reconciliation remain authoritative.

## Fail-closed authentication rate limiting

**Status:** Accepted

**Context:** Login, registration, refresh, and AI generation need limits that work across replicas, and the failure policy must be explicit.

**Alternatives:** Per-process counters; distributed Redis counters that fail open; Redis counters with endpoint-specific fail policy.

**Decision and rationale:** Use atomic Redis counters with TTL. Authentication and other abuse-sensitive unauthenticated paths fail closed if the limiter is unavailable; already-authenticated business operations use their documented degradation policy.

**Consequences:** Redis is a required dependency for authentication readiness. Limits require trusted-proxy configuration before deriving client IP. Tests cover TTL, boundaries, and failure behavior; counters carry no durable business meaning.
