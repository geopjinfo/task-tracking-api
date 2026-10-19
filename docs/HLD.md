# High-level design

## Purpose and scope

The system is a backend API for collaborative task tracking. It provides identity and sessions, profiles, projects, membership invitations, task collaboration, private attachments, durable notifications, SSE delivery, OpenRouter-assisted drafts and summaries, and invitation email. The release boundary and requirement IDs are defined in `REQUIREMENTS.md`. WebSockets, scheduled digests, analytics, billing, Kubernetes, and an advanced audit ledger are deferred.

## Architectural style

The application is a modular monolith: one deployable API plus an outbox worker, separated into identity, users, projects, memberships, tasks, comments, attachments, notifications, AI, and email modules. Each module owns domain, application, ports, infrastructure adapters, HTTP presentation, and an explicit entry point.

```text
HTTP controller → application service → domain model
                              ↓
                       repository/provider port
                              ↑
                 MongoDB/Redis/S3/HTTP adapter
```

Controllers translate HTTP. Services own orchestration, authorization, and transaction intent. Domain objects own invariants. Infrastructure implements ports. Express, MongoDB, Redis, storage SDK, and provider response types do not enter domain entities.

## System context

```text
Person using a web/API client
        │ HTTPS + JSON / SSE
        ▼
Task Tracking System
   ├── MongoDB          durable source of truth
   ├── Redis            disposable rate limits and live fan-out
   ├── S3/MinIO         private attachment objects
   ├── OpenRouter       AI generation provider
   ├── SMTP/Mailpit     invitation email delivery
   └── OTLP collector   optional telemetry export
```

The client and all external provider responses are untrusted. MongoDB is authoritative for business state, outbox events, notification inboxes, membership, and durable usage records.

## Container and deployment view

```text
┌─────────────────┐       ┌───────────────────────────────────────┐
│ Web / API client│──────▶│ Express API                           │
│                 │◀──────│ auth, validation, modules, REST, SSE  │
└─────────────────┘       └──────────┬──────────────┬─────────────┘
                                     │              │
                              transaction      signed URLs
                                     │              │
                               ┌─────▼─────┐   ┌────▼─────┐
                               │ MongoDB   │   │ MinIO/S3 │
                               └─────┬─────┘   └──────────┘
                                     │ outbox
                               ┌─────▼────────┐
                               │ Outbox worker│──────▶ SMTP provider
                               └─────┬────────┘
                                     │ durable notification first
                                     ▼
                                  Redis ─────▶ authenticated SSE

Express API ─────▶ OpenRouter (bounded input, validated output, no automatic mutation)
Express API ─────▶ OTLP collector when explicitly enabled
```

Production uses HTTPS ingress, API replica(s), a worker, MongoDB replica set, Redis, S3-compatible storage, and outbound HTTPS/SMTP. Local Compose provides API, MongoDB replica set, Redis, MinIO, and Mailpit. The optional `observability` profile adds an OTLP collector, Tempo, Loki, Prometheus, and Grafana. Normal application startup does not require that profile.

The API and worker may share one process locally. Multiple API replicas use Redis Pub/Sub for live fan-out but never rely on it for durability.

## Component ownership

| Component | Responsibility | Durable data |
|---|---|---|
| Identity | Registration, login, JWT verification, refresh rotation/replay, logout | `users`, `sessions` |
| Projects | Project creation, metadata, visible-project queries | `projects` |
| Memberships | RBAC, members, invitations and acceptance | `memberships`, `invitations` |
| Tasks | Lifecycle, assignment, filters, search, pagination, concurrency | `tasks` |
| Comments | Ordered discussion and comment events | `comments` |
| Attachments | Upload intent, verification, authorized download | `attachments`; S3 objects |
| Notifications | Typed events, outbox, inbox/read state, REST and SSE | `outbox_events`, `notifications` |
| AI | Access, quotas, bounded prompts, provider validation | optional usage records |
| Email | Provider-neutral invitation delivery, retry, idempotency | outbox delivery state |
| Platform | Clients, transactions, logging, telemetry, health and shutdown | adapter operational state only |

Modules use typed public services or ports and do not query another module's collection directly.

## Trust boundaries and controls

1. Every HTTP field is untrusted, size bounded, and parsed with Zod.
2. JWT verification checks algorithm, issuer, audience, expiry, subject, and session claim. Identity alone does not authorize resources.
3. Current project membership plus the `REQUIREMENTS.md` role matrix authorizes every project-owned operation. Cross-project identifiers are concealed with 404 responses.
4. Refresh tokens are opaque, hashed, rotating, and stored in Secure/HttpOnly/SameSite cookies for HTTPS. Cookie-authenticated mutations follow the CSRF policy.
5. Object storage is private. Signed URLs are short-lived and issued after current authorization. Confirmation checks the expected object.
6. AI, email, Redis, storage, and telemetry data are untrusted. Secrets, tokens, prompts, mail bodies, and signed URLs are redacted.
7. Metrics exclude user/project identifiers and sensitive or high-cardinality labels. Telemetry cannot decide request success.

## Core flows

### Sessions

Registration normalizes email, hashes the password with Argon2id, creates a session, returns a short access JWT, and sets an opaque refresh cookie. Login uses a non-enumerating credential error. Refresh consumes the current hashed token and creates its successor. Reuse revokes the token family. Logout revokes the presented session.

### Projects and invitations

Project creation writes project and owner membership in one transaction. Invitation creation stores a token hash and expiry, commits independently of provider availability, and writes retryable email intent. Acceptance verifies user email, status, and expiry, then upserts membership and marks acceptance in one transaction. Repeated successful acceptance is idempotent.

### Task mutation and notification

```text
authenticate → validate → load scope → authorize role/resource
 → update task with expected version + write outbox event in one transaction
 → worker leases event → upsert notification by eventId + recipientId
 → publish Redis hint → authenticated SSE emits live event
```

REST inbox retrieval is authoritative. Pub/Sub and SSE are best effort; reconnect uses cursor-based REST reconciliation.

### Attachments

The API authorizes task access, validates metadata, records a pending attachment, and issues a short upload URL. Confirmation verifies object existence and expected metadata before readiness. Download rechecks current membership and returns a short URL. Stale pending records and orphan objects are cleanup candidates.

### AI generation

The API checks access, bounds, and per-user/project quota before calling the configured OpenRouter model with a fixed system instruction. Provider JSON is validated and output bounded. Results are suggestions and never mutate tasks without a separate explicit user request.

## Consistency and delivery guarantees

- MongoDB transactions protect multi-record workflows and require a replica set.
- Unique indexes enforce normalized email, membership, token hash, and notification delivery keys.
- Expected-version task updates return HTTP 409 instead of overwriting concurrent changes.
- Outbox processing is at-least-once; notification projection is effectively once per recipient through a unique delivery key.
- Redis and SSE are disposable. REST reconciliation recovers durable state.
- Invitation acceptance and email delivery jobs are idempotent. Email failure does not invalidate an invitation.
- Attachment upload is a two-step, eventually consistent workflow with bounded cleanup.

## Failure containment

| Failure | Required behavior |
|---|---|
| MongoDB unavailable | Readiness fails; stable retryable errors; no partial transaction reported successful |
| Redis unavailable | Auth limiting fails closed; durable state remains authoritative; live fan-out is degraded |
| MinIO/S3 unavailable | Attachment calls fail independently; task/comment workflows continue |
| OpenRouter failure/429/invalid body | Stable 429/502/503; no mutation or provider detail leakage |
| SMTP unavailable | Invitation remains valid; delivery retries with idempotency key |
| Worker crash | Lease expires; retry occurs; delivery key prevents duplicate inbox entries |
| SSE disconnect | Subscription is released; client reconciles through REST |
| Telemetry unavailable | Bounded export loss; business request behavior unchanged |

## Non-functional targets

- Security requirements and the negative authorization matrix block release.
- Strict TypeScript enables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `useUnknownInCatchVariables`; explicit `any`, suppression comments, and unvalidated external JSON are prohibited.
- Indexed local list/read endpoints target P95 ≤ 300 ms under a documented workload; this is not claimed before measurement.
- Graceful shutdown stops acceptance, drains bounded work, closes clients, and exits within ten seconds. Liveness is process health; readiness checks required dependencies.
- JSON logs include request ID, optional trace ID, service/environment, route, status, duration, and stable error code with secret redaction.
- A fresh clone starts with documented prerequisites and passes the smoke flow without live provider credentials.

## Architecture invariants

- MongoDB is durable; Redis is disposable.
- Authorization lives in application services, not only middleware or decorators.
- Persistence documents and provider SDK objects remain inside infrastructure.
- Optional integrations do not weaken mandatory workflows.
- Significant decisions live only in `docs/DECISIONS.md`.
- The private planning HTML, trackers, scratch notes, logs, and tooling metadata stay outside this repository.

`DECISIONS.md` records accepted choices and consequences. This document is normative for boundaries; `LLD.md` defines implementation contracts and sequences; `DATABASE_DESIGN.md` defines persistence details.
