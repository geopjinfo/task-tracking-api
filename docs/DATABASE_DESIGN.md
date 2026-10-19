# Database design

This design applies the persistence choices recorded in `DECISIONS.md` and the consistency boundaries defined by `HLD.md` and `LLD.md`.

All IDs are UUIDv7 strings and timestamps are UTC dates. Collections are `users`, `sessions`, `projects`, `memberships`, `invitations`, `tasks`, `comments`, `attachments`, `notifications`, and `outbox_events`.

Unique indexes enforce normalized user email, refresh token hash, invitation token hash, `(projectId,userId)` membership and notification delivery key. Task listing uses `(projectId,createdAt desc,id desc)` and a text index on title and description. Notification inboxes use `(recipientId,createdAt desc,id desc)`; workers claim `(status,availableAt,leaseUntil)`.

References are validated in application services because MongoDB has no foreign keys. Invitation acceptance and project creation use transactions. Cursor pagination uses stable fields plus ID. The one-collection-per-logical-table shape permits a later SQL adapter, but query and migration work would still be required.

## Relationship model

```text
User 1 ── * Session
User 1 ── * Membership * ── 1 Project
Project 1 ── * Invitation
Project 1 ── * Task
User 1 ── * Task (createdBy)
User 0..1 ── * Task (assigneeId)
Task 1 ── * Comment
Task 1 ── * Attachment
User 1 ── * Notification
Project/Task aggregates 1 ── * OutboxEvent
```

Collections remain top-level. No unbounded comments, members, attachments, or notifications are embedded in parent documents.

## Data dictionary

### `users`

| Field | Type | Rules |
|---|---|---|
| `id` | UUIDv7 string | immutable primary identifier |
| `emailNormalized` | string | lowercase/trimmed, unique, never returned as authentication evidence |
| `displayName` | string | 2–80 characters |
| `passwordHash` | string | Argon2id encoded hash; never logged or returned |
| `createdAt`, `updatedAt` | UTC date | required |

Indexes: unique `{emailNormalized:1}` and unique `{id:1}`. Registration is the only writer of email identity in this release.

### `sessions`

| Field | Type | Rules |
|---|---|---|
| `id` | UUIDv7 string | JWT `sid` claim |
| `userId` | UUIDv7 string | references user |
| `familyId` | UUIDv7 string | rotation/reuse revocation group |
| `tokenHash` | SHA-256 string | unique; raw token never persists |
| `expiresAt` | UTC date | absolute refresh expiry |
| `rotatedAt`, `revokedAt` | UTC date? | terminal token state |
| `createdAt` | UTC date | required |

Indexes: unique `{tokenHash:1}`, `{familyId:1}`, `{userId:1,createdAt:-1}`, and TTL `{expiresAt:1}` with `expireAfterSeconds:0`. TTL cleanup is not part of authorization; expiry is checked synchronously.

### `projects`

Fields: `id`, `name`, `description`, `ownerId`, `createdAt`, `updatedAt`, optional `archivedAt`. `ownerId` is an invariant mirror of the owner membership and may change only through a future explicit ownership-transfer transaction.

Indexes: unique `{id:1}` and `{ownerId:1,createdAt:-1}`.

### `memberships`

Fields: `id`, `projectId`, `userId`, `role` (`owner|admin|member`), `createdAt`, optional `updatedAt`. Unique `{projectId:1,userId:1}` prevents duplicate membership. `{userId:1,createdAt:-1}` supports visible-project lookup. `{projectId:1,role:1}` supports role administration.

Application services verify referenced project/user existence. The last owner cannot be removed or demoted without an ownership transfer.

### `invitations`

Fields: `id`, `projectId`, `emailNormalized`, `role` (`admin|member`), `tokenHash`, `status` (`pending|accepted|revoked|expired`), `expiresAt`, `createdBy`, `createdAt`, optional `acceptedAt`, `acceptedBy`, `revokedAt`.

Indexes: unique `{tokenHash:1}`, `{projectId:1,emailNormalized:1,status:1}`, `{expiresAt:1}`, and `{projectId:1,createdAt:-1}`. Expiry is enforced during acceptance; maintenance may later mark expired rows. Tokens are random, single-use, and never logged.

### `tasks`

| Field | Type | Rules |
|---|---|---|
| `id`, `projectId` | UUIDv7 string | immutable |
| `title` | string | 1–200 characters |
| `description` | string | at most 10,000 characters |
| `status` | enum | `todo`, `in_progress`, `done` |
| `assigneeId` | UUIDv7 string? | must be a current project member |
| `dueDate` | UTC date? | client semantics documented as an instant |
| `version` | positive integer | optimistic lock, incremented once per mutation |
| `createdBy` | UUIDv7 string | current member at creation |
| `createdAt`, `updatedAt` | UTC date | required |

Indexes: unique `{id:1}`; `{projectId:1,createdAt:-1,id:-1}`; `{projectId:1,status:1,createdAt:-1,id:-1}`; `{projectId:1,assigneeId:1,createdAt:-1,id:-1}`; `{assigneeId:1,createdAt:-1,id:-1}`; `{projectId:1,dueDate:1,id:1}`; text `{title:'text',description:'text'}`.

The MVP search contract is MongoDB text search. It does not promise arbitrary case-insensitive substring matching. Text relevance cannot be freely combined with every sort; incompatible combinations return validation errors or use the documented created-date order.

### `comments`

Fields: `id`, `taskId`, `projectId`, `authorId`, `body` (1–5,000 characters), `createdAt`, optional `editedAt`. Index `{taskId:1,createdAt:1,id:1}` provides stable chronological retrieval. `projectId` is duplicated deliberately for authorization scope and cleanup.

### `attachments`

Fields: `id`, `taskId`, `projectId`, `ownerId`, `objectKey`, `fileName`, `contentType`, `size`, optional `checksum`, `status` (`pending|ready|failed|deleted`), `createdAt`, optional `completedAt`, `deletedAt`.

Indexes: unique `{id:1}`, unique `{objectKey:1}`, `{taskId:1,createdAt:1}`, and `{status:1,createdAt:1}` for cleanup. Object keys use generated identifiers rather than user filenames. A pending record is not downloadable.

### `notifications`

Fields: `id`, `recipientId`, optional `actorId`, `projectId`, optional `taskId`, `type`, `title`, `body`, `deliveryKey`, optional `readAt`, `createdAt`.

Indexes: unique `{deliveryKey:1}`; `{recipientId:1,createdAt:-1,id:-1}`; `{recipientId:1,readAt:1,createdAt:-1}`. Queries always include authenticated `recipientId`. Current project visibility is rechecked when the event refers to project content.

### `outbox_events`

Fields: `id`, `eventType`, `aggregateId`, `projectId`, `actorId`, `recipientIds`, typed `payload`, `status` (`pending|processing|processed|failed`), `attempts`, `availableAt`, optional `leaseUntil`, `createdAt`, optional `processedAt`, `lastErrorCode`.

Indexes: `{status:1,availableAt:1,leaseUntil:1,createdAt:1}` for atomic claims and `{aggregateId:1,createdAt:1}` for diagnosis. Payloads contain bounded identifiers and display text required for delivery, not credentials or full provider requests.

### `ai_usage` (durable quota window when enabled)

Fields: `id`, `userId`, `projectId`, `operation`, `model`, `inputUnits`, `outputUnits`, `createdAt`. Index `{userId:1,projectId:1,createdAt:-1}`. Full prompts and provider responses are not stored by default. Redis may enforce short windows; durable records support accounting and investigation.

## Query-to-index mapping

| Query | Index |
|---|---|
| Login by normalized email | unique `users.emailNormalized` |
| Refresh by token | unique `sessions.tokenHash` |
| Revoke token family | `sessions.familyId` |
| List user's projects | `memberships(userId,createdAt)` then `projects.id` |
| Check project role | unique `memberships(projectId,userId)` |
| List/filter project tasks | task compound indexes beginning with `projectId` |
| Assigned-to-me | `tasks(assigneeId,createdAt,id)` |
| Task comments | `comments(taskId,createdAt,id)` |
| Notification inbox/unread | recipient compound indexes |
| Claim outbox work | `outbox_events(status,availableAt,leaseUntil,createdAt)` |
| Clean stale uploads | `attachments(status,createdAt)` |

Explain plans for representative seeded queries are captured during integration testing. A collection scan on a release-critical list query fails the database gate.

## Pagination and concurrency

Cursor values encode the stable sort field and `id`, are opaque to clients, and are validated before use. A next-page predicate compares both values to prevent gaps among equal timestamps. Maximum page size is 100. Offset pagination is not used for mutable lists.

Task mutations match `{id,version}` and atomically increment `version`. Zero modified documents means either absence/authorization concealment or a version conflict, resolved in the service without a blind retry.

Task completion sets `completedAt`; moving a completed task back to in-progress clears it. Due dates must be future instants when set and may be explicitly cleared. Task-list cursors contain the selected sort value and ID, and apply a matching compound boundary rather than comparing IDs alone.

## Transactions

| Workflow | Atomic records |
|---|---|
| Create project | project + owner membership |
| Accept invitation | membership upsert + invitation accepted state |
| Task create/assign/reassign/complete/comment | business record + typed outbox event |
| Produce notification | notification upsert + outbox processed state where practical |
| Create invitation email intent | invitation + mail outbox intent |

External HTTP, SMTP, Redis publication, and object-storage calls never occur inside MongoDB transactions. They are triggered after commit through durable intent.

## Reference cleanup and retention

- Project deletion is not exposed in the initial API; archival avoids an unsafe unbounded synchronous cascade.
- Task deletion marks or removes task-owned comments and attachment metadata according to the service transaction/cleanup policy; private objects are deleted asynchronously and idempotently.
- Expired sessions may be TTL-deleted after synchronous expiry checks.
- Processed outbox events and old read notifications use a documented operational retention period before maintenance deletion; no TTL is added until that period is selected for deployment.
- Stale pending attachments are marked failed and their object keys removed if present.
- User deletion is deferred because it requires an explicit ownership, authorship, and retention policy.

## Redis data policy

Redis stores only expiring rate-limit counters, AI quota counters where configured, and transient Pub/Sub messages. Keys include environment and purpose prefixes and always have TTL when they represent counters. Redis loss cannot remove business, notification, membership, or outbox history.

## SQL migration boundary

Each collection maps to one logical table; UUID strings become UUID primary/foreign keys, unique indexes become constraints, and enum values become checked columns or lookup types. Repository and transaction ports remain stable while Mongo adapters are replaced. Text search, cursor predicates, transaction retry behavior, TTL cleanup, and outbox claiming require database-specific implementations and shared repository contract tests. Portability is a deliberate boundary, not a zero-work promise.
