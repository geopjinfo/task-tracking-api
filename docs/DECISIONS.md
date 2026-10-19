# Architecture decisions

## Modular monolith

**Status:** Accepted. The system is one deployment with explicit feature and platform boundaries. This keeps the assignment operable while preserving seams for later extraction.

## MongoDB with repository boundaries

**Status:** Accepted. MongoDB is the durable source of truth. UUIDv7 strings and explicit references avoid leaking database identifiers into domain contracts. A replica set enables atomic multi-document workflows.

## Short access tokens and rotating refresh sessions

**Status:** Accepted. Fifteen-minute access JWTs are paired with hashed, rotating refresh tokens. Reuse revokes the entire session family. This adds persistence work but permits logout and compromise response.

## Redis is disposable

**Status:** Accepted. Redis is reserved for rate limiting and live fan-out. Tasks, membership, notifications and outbox state remain in MongoDB so Redis loss cannot lose business data.

## Private object storage

**Status:** Accepted. Attachments use MinIO-compatible S3 storage and short-lived signed URLs issued only after project authorization. Files are not served publicly by the API.

## REST plus SSE

**Status:** Accepted. REST owns mutations and reconciliation; SSE provides best-effort live notifications. Bidirectional WebSockets would add infrastructure without a current use case.

## Provider ports and explicit AI approval

**Status:** Accepted. Mailpit is the local email system and provider settings are configurable. OpenRouter output is validated and returned as an unpersisted draft; no AI response mutates a task automatically.

## Backend-neutral observability

**Status:** Accepted. Pino JSON logs and AsyncLocalStorage request context are always available. OpenTelemetry export and the local Grafana stack are optional. Application code has no Loki-specific client dependency.

## Transactional outbox with bounded leases

**Status:** Accepted. Mutations that create delivery obligations write an outbox event in the same MongoDB transaction. A worker claims one event with a 30-second lease, deduplicates recipients, upserts notifications by `eventId:recipientId`, and publishes best-effort Redis hints. Durable inbox reconciliation remains authoritative if publication fails or a client disconnects.

## Fail-closed authentication rate limiting

**Status:** Accepted. Authentication endpoints use Redis counters with short TTLs. If Redis is unavailable, these sensitive endpoints return a temporary dependency error instead of accepting unlimited password attempts; authenticated business operations remain independent of the limiter.
