# Low-level design

Requests pass through correlation context, structured logging, JSON bounds, authentication, Zod validation, application policy and persistence. Controllers translate HTTP; services and policies own use cases; infrastructure owns MongoDB, Redis, storage, mail and AI details.

Task updates include an expected `version`. MongoDB updates match both ID and version and increment atomically; no match produces HTTP 409. Invitation acceptance validates token hash, email, status and expiry, then writes membership and acceptance in one transaction.

Refresh tokens are random opaque values stored only as SHA-256 hashes. Rotation marks the prior token used. Presenting a used token revokes its family. `AsyncLocalStorage.run` scopes request and identity correlation across asynchronous work.

Attachment creation stores pending metadata and returns a ten-minute upload URL. Confirmation verifies the object before marking it ready. Download performs current membership authorization before returning a five-minute URL.

External responses are parsed from `unknown`. OpenRouter receives bounded context and returns an unpersisted draft. Email failure is logged and does not roll back invitation creation.

Assignment and collaboration mutations create typed outbox records. The worker atomically claims available work with a bounded lease, increments attempts, creates each recipient notification through a unique delivery key, and publishes a Redis hint only after durable persistence. Self-notifications and duplicate recipients are removed. Expired work leases are eligible for retry.

## Canonical source structure

```text
src/
  main.ts                         process entry point
  app/                            HTTP application and module registry
  bootstrap/                      composition, server, worker, shutdown
  config/                         environment schema and validated config
  modules/
    identity/
      domain/                     User, Session and invariants
      application/                AuthService, ProfileService
        ports/                    UserRepository, SessionRepository
      infrastructure/persistence/ Mongo user/session adapters
      presentation/http/          schemas, controller, middleware, routes
      identity.module.ts          explicit module registration
    projects/ memberships/ tasks/ comments/ attachments/
    notifications/ ai/ email/     same layer convention
  platform/
    database/ redis/ storage/ events/ security/ logging/ telemetry/
  shared/
    errors/ validation/ pagination/ ids/ context/
```

Only implemented modules and files are created. Modules export an entry point rather than exposing infrastructure internals.

## Dependency graph and composition

```text
bootstrap
  ├── validated Config
  ├── MongoClient → database/repositories/TransactionManager
  ├── Redis clients → RateLimiter/Publisher/Subscriber
  ├── S3 client → ObjectStorage
  ├── HTTP client → AIProvider
  ├── SMTP transport → MailerPort
  ├── module factories → services/controllers/routes
  ├── Express application
  └── OutboxWorker
```

The bootstrap layer is the only place that constructs concrete adapters. Controllers receive application services. Services receive ports and policies. Domain types import neither presentation nor infrastructure.

## Layer contracts

| Layer | Owns | Must not own |
|---|---|---|
| HTTP schema/controller | parsing, status code, DTO mapping, response headers | database queries, business authorization, provider calls |
| Application service | use-case sequence, policy checks, transaction boundary, error semantics | Express request/response or SDK response objects |
| Domain | entities, status transitions, value invariants, event data | network, persistence, logging |
| Repository/provider port | database/provider-neutral capabilities | Mongo filters or third-party JSON shapes |
| Infrastructure adapter | queries, mappings, retries at transport boundary, provider validation | HTTP response decisions |
| Bootstrap | construction, lifecycle, shutdown order | use-case decisions |

Decorators are not used for routing or authorization. Explicit Express middleware may establish identity and request context; application services repeat the resource-level authorization required by the use case.

## Shared types

```ts
type Page<T> = { items: T[]; nextCursor?: string };

type TransactionManager = {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
};

type AppErrorCode =
  | 'VALIDATION_ERROR' | 'AUTH_REQUIRED' | 'INVALID_CREDENTIALS'
  | 'RESOURCE_NOT_FOUND' | 'FORBIDDEN' | 'VERSION_CONFLICT'
  | 'RATE_LIMITED' | 'DEPENDENCY_UNAVAILABLE' | 'PROVIDER_ERROR';
```

Public DTOs use UUID strings and ISO-8601 timestamps. Mongo documents are mapped explicitly. Unknown input and provider JSON are parsed before property access. Optional properties are omitted rather than emitted with `undefined`.

## Principal ports

```ts
interface UserRepository {
  insert(user: User, tx?: Transaction): Promise<boolean>;
  findById(id: string, tx?: Transaction): Promise<User | null>;
  findByEmail(email: NormalizedEmail, tx?: Transaction): Promise<User | null>;
  updateProfile(id: string, changes: ProfileChanges): Promise<User | null>;
}

interface SessionRepository {
  insert(session: Session, tx?: Transaction): Promise<void>;
  findByTokenHash(hash: string, tx?: Transaction): Promise<Session | null>;
  rotate(id: string, replacement: Session, tx: Transaction): Promise<boolean>;
  revokeFamily(familyId: string, at: Date, tx?: Transaction): Promise<void>;
}

interface TaskRepository {
  insert(task: Task, tx?: Transaction): Promise<void>;
  findById(id: string, tx?: Transaction): Promise<Task | null>;
  search(query: TaskQuery): Promise<Page<Task>>;
  update(task: Task, expectedVersion: number, tx?: Transaction): Promise<boolean>;
  delete(id: string, tx?: Transaction): Promise<boolean>;
}

interface ObjectStorage {
  createUploadUrl(input: UploadIntent): Promise<SignedUpload>;
  inspect(key: ObjectKey): Promise<ObjectMetadata | null>;
  createDownloadUrl(key: ObjectKey, fileName: string): Promise<SignedDownload>;
  delete(key: ObjectKey): Promise<void>;
}

interface AIProvider {
  generate(input: GenerationRequest): Promise<GenerationResult>;
}

interface MailerPort {
  sendInvitation(message: InvitationMessage, idempotencyKey: string): Promise<void>;
}
```

Notification ports are `OutboxRepository`, `NotificationRepository`, `NotificationPublisher`, and `TransactionManager`. Redis implements publication, not durable inbox storage.

## Request lifecycle

```text
request
 → request ID + AsyncLocalStorage context
 → structured request logger and body bound
 → CORS/security headers
 → authentication where required
 → route parameter/query/body Zod parsing
 → controller DTO translation
 → application service and resource policy
 → transaction/repository/provider port
 → response DTO and status
 → centralized stable error mapping
```

The request context may add authenticated user and project identifiers for correlated logs, but services receive identity explicitly and do not depend on ambient context for authorization.

## Identity sequences

### Registration and login

```text
Controller → validate bounded credentials
AuthService → normalize email
AuthService → UserRepository lookup/insert
AuthService → PasswordHasher Argon2id hash/verify
AuthService → SessionRepository insert hashed refresh token
TokenSigner → 15-minute access JWT
Controller → access token body + refresh cookie
```

Registration maps a unique email conflict to 409. Login always maps unknown email and wrong password to the same 401 response. Password verification uses the stored Argon2id parameters; parameters may be upgraded after successful authentication.

### Refresh

```text
Controller → require refresh cookie + CSRF evidence
AuthService → SHA-256 token hash
TransactionManager → SessionRepository load
  ├── absent/expired/revoked → 401
  ├── already rotated → revoke family → 401 reuse detected
  └── active → atomically mark rotated + insert replacement
TokenSigner → new access JWT
Controller → replace refresh cookie
```

Two concurrent uses cannot both rotate successfully. Logout hashes the cookie, revokes the matching session, and clears it; it is idempotent.

## Project and membership sequences

Project creation validates fields, creates `Project` and owner `Membership`, and inserts both through one transaction. Listing starts from memberships for the authenticated user and never accepts arbitrary project scopes.

Invitation creation requires owner/admin, normalizes email, creates a random token, stores only its hash, and commits invitation plus mail outbox intent. The raw token exists only long enough to construct the invitation URL passed to the mail intent.

Invitation acceptance loads by hash, compares normalized authenticated email, checks pending state and expiry, then transactionally upserts membership and transitions invitation to accepted. A matching already-accepted invitation returns its project without duplicating membership; wrong-user and unknown tokens use concealed errors.

Invitation rejection applies the same identity, state, and expiry checks and is idempotent after the first rejection. Removing a non-owner membership and clearing that user's task assignments occur in one transaction. Task versions increment when an assignee is cleared so concurrent clients cannot overwrite the removal. Owners cannot be removed; administrators cannot remove another administrator, while any non-owner may leave by removing their own membership.

## Task sequences

### Create and assign

```text
Controller → parse project ID and body
TaskService → require actor membership
TaskService → require assignee membership when present
Domain → create task in `todo`
TransactionManager → TaskRepository.insert + OutboxRepository.insert(task.assigned)
Controller → 201 task DTO
```

Assignment requires owner/admin, validates current assignee membership, loads the expected version, mutates the domain entity, and transactionally updates task plus `task.assigned` or `task.reassigned`. Version mismatch returns 409. Self-notifications are removed during recipient calculation.

### Status and deletion

The domain allows `todo → in_progress`, `in_progress → todo|done`, and `done → in_progress`. Unsupported transitions return 422. Completion writes `task.completed` in the same transaction as the versioned task update. Deletion requires owner/admin and coordinates comment/attachment metadata cleanup without making an unbounded storage call inside the transaction.

### Search and pagination

The query schema bounds limit to 100 and validates status, assignee, search, sort, and opaque cursor. The repository scopes by authorized project, applies the documented compound index, fetches `limit + 1`, and emits a cursor containing the stable sort value and ID. Assigned-to-me fixes `assigneeId` to the authenticated user.

## Comment sequence

The service loads the task, verifies current membership, and creates the comment. Listing uses a stable `(createdAt,id)` chronological cursor. Only the original author can edit or delete; deletion erases the body and retains a `[deleted]` tombstone so pagination and discussion chronology remain stable. Empty/oversized bodies return 422. Notification outbox integration is added at the notification phase so the final write path commits the comment and `task.commented` event atomically.

## Attachment sequences

### Upload intent and confirmation

```text
authorize task → validate name/type/size → generate object key
 → insert pending metadata → return 10-minute signed PUT URL
client uploads directly
 → confirm endpoint authorizes again → ObjectStorage.inspect
 → verify object exists and expected size/type/checksum
 → mark ready or stable dependency/validation error
```

Confirmation is idempotent for an already-ready matching object. It compares actual object size and MIME type with the stored intent; mismatch fails the record and removes the object. Download authorizes current project membership and ready state, sanitizes content-disposition filename, and returns a five-minute signed URL. The uploader or a project owner/admin may delete; metadata is hidden before private-object removal. Stale pending intents are failed and their keys cleaned idempotently. Storage errors do not reveal bucket/key details.

## Typed events and outbox worker

```ts
type DomainEvent =
  | { type: 'task.assigned'; taskId: string; projectId: string; actorId: string; assigneeId: string; title: string }
  | { type: 'task.reassigned'; taskId: string; projectId: string; actorId: string; assigneeId: string; title: string }
  | { type: 'task.completed'; taskId: string; projectId: string; actorId: string; title: string }
  | { type: 'task.commented'; taskId: string; projectId: string; actorId: string; commentId: string; title: string };
```

The worker atomically claims one eligible event by setting `processing`, `leaseUntil`, and incrementing attempts. It recalculates or validates current visibility, deduplicates recipients, excludes actor by default, and upserts notifications with `eventId:recipientId`. It publishes Redis only after durable insertion. Success marks processed. Transient failure applies bounded exponential backoff with jitter; terminal validation failure records a stable error code and failed status. Expired leases can be reclaimed. Shutdown stops new claims and gives current work a bounded drain period.

## Notification REST and SSE

Inbox, unread count, read, and read-all queries always include authenticated `recipientId`. Project-linked notification retrieval rechecks current visibility.

SSE authenticates with the normal authorization channel, caps concurrent connections per user, subscribes to that user's Redis channel, emits a connected event and periodic comment heartbeat, and unsubscribes/quits on abort. Persistent bearer tokens are never accepted in query strings. Reconnection fetches missed durable notifications using REST; the stream makes no replay guarantee.

## AI sequence

The controller validates bounded task context. The service checks project access and Redis/durable quota, builds a provider-neutral generation request, and calls `AIProvider` with timeout and bounded tokens. The OpenRouter adapter supplies configured model and bearer key, treats returned JSON as unknown, validates the choices/content shape, sanitizes/bounds text, and maps 429, timeout, malformed body, and upstream failure to stable errors. Generated output remains unpersisted.

Prompt construction separates fixed instruction from serialized untrusted task data. Task/comments are selected server-side for summaries; clients cannot inject inaccessible project content.

## Email sequence

Invitation transaction creates a mail delivery intent with an idempotency key. The delivery handler renders a fixed template with escaped values and invokes `MailerPort`. Mailpit is the local adapter. Failure records stable code and retry time without logging token URL or recipient body. Duplicate execution reuses the idempotency key and cannot create another invitation.

## Error and retry policy

| Condition | HTTP / worker behavior |
|---|---|
| malformed JSON | 400 `MALFORMED_JSON` |
| schema/semantic input | 422 `VALIDATION_ERROR` or domain code |
| missing/invalid access | 401 stable auth code |
| insufficient role | 403 only when resource visibility is already established |
| cross-project/unknown resource | concealed 404 |
| optimistic conflict/duplicate state | 409 |
| quota/rate limit | 429 with bounded retry metadata |
| provider rejected/malformed | 502 |
| required dependency unavailable | 503 |

Only transport operations documented as idempotent are automatically retried. Application services do not retry version conflicts. Error responses include request ID and never include stack, raw database error, secret, or provider body.

## Lifecycle and observability

Startup validates configuration before opening listeners, connects MongoDB and Redis, ensures required indexes/bucket readiness, registers modules, starts the worker, then marks readiness. Shutdown marks unready, stops HTTP acceptance and worker claims, closes SSE connections, drains bounded work, flushes telemetry, closes Redis/Mongo/storage clients, and exits within ten seconds.

Pino logs use `AsyncLocalStorage` request context. OpenTelemetry traces HTTP, MongoDB, Redis, outbox, storage, AI, and mail boundaries when enabled. Metrics include request duration/error count, active SSE connections, rate-limit decisions, outbox depth/age/retries, and provider latency/failures without user/project label values.

## Implementation decisions

Significant choices are recorded once in `DECISIONS.md`. This LLD implements those choices explicitly: modular monolith, native MongoDB adapters, UUIDv7, short JWT plus rotating refresh sessions, service-level RBAC, private signed-object access, transactional outbox, REST reconciliation with SSE, disposable Redis, typed OpenRouter adapter, Mailpit local delivery, and backend-neutral observability.
