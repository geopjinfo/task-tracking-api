# High-level design

## Scope and topology

Clients call an Express modular monolith over JSON/HTTP. MongoDB stores all durable state. Redis supports disposable coordination, MinIO stores private attachments, Mailpit receives local invitation mail, and OpenRouter optionally drafts task text. The API and its worker are designed as separate process roles even when run together locally.

`Client → Express → application policy → MongoDB / MinIO`

`State change → MongoDB outbox → notification projection → Redis fan-out → SSE`

## Trust boundaries

All HTTP and provider data is untrusted and validated. A verified JWT identifies a session; project membership authorizes an action. Resource queries are project-scoped. Signed object URLs are short-lived. Logs redact credentials and provider keys.

## Reliability and operations

MongoDB transactions protect multi-record workflows. Optimistic task versions return conflicts rather than overwrite concurrent changes. Readiness checks MongoDB; liveness checks the process. Shutdown stops HTTP acceptance and closes the database. Optional OTLP tracing does not affect request success.

## Trade-offs

The native MongoDB driver requires explicit mapping but avoids ODM leakage. SSE is simpler than WebSockets and fits server-to-client notifications. MongoDB text search is sufficient for the assignment but does not promise arbitrary substring matching.
