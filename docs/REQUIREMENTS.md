# Requirements and traceability

## Delivery boundary

The release is a backend API for collaborative task tracking. The mandatory gate is correct project-isolated workflows, documented contracts, automated verification, and reproducible Docker startup. Redis, persistent notifications with SSE, OpenRouter drafting and summaries, invitation email, and private object storage are included target capabilities. WebSockets, notification digests, analytics, billing, Kubernetes, and an advanced audit ledger are deferred.

## Functional requirements

| ID | Requirement | API surface | Primary acceptance evidence |
|---|---|---|---|
| AUTH-01 | Register with normalized unique email, display name, and password | `POST /auth/register` | HTTP test: valid registration; duplicate normalized email; weak and malformed input |
| AUTH-02 | Log in without revealing whether an account exists | `POST /auth/login` | HTTP test: success and identical invalid-credential response |
| AUTH-03 | Rotate hashed refresh tokens and revoke a family after reuse | `POST /auth/refresh` | Integration test: rotation, replay, family revocation, expiry |
| AUTH-04 | Revoke the presented session on logout | `POST /auth/logout` | Integration test: refresh rejected after logout |
| USER-01 | Read and update the authenticated profile | `GET/PATCH /users/me` | HTTP tests for authentication, validation, and persistence |
| PROJ-01 | Create a project and owner membership atomically | `POST /projects` | Mongo transaction test and response contract |
| PROJ-02 | List/read only projects visible through membership | `GET /projects`, `GET /projects/{id}` | Cross-user isolation and IDOR tests |
| PROJ-03 | Owner/admin can update project metadata | `PATCH /projects/{id}` | RBAC matrix tests |
| MEM-01 | Owner/admin can create a one-time expiring invitation | `POST /projects/{id}/invitations` | Permission, normalized email, token hashing, expiry tests |
| MEM-02 | Matching user can accept an invitation idempotently | `POST /invitations/{token}/accept` | Transaction, replay, wrong-user, and expired-token tests |
| MEM-03 | Members can list current project membership | `GET /projects/{id}/members` | Membership and isolation tests |
| TASK-01 | Member can create and read project tasks | `POST /projects/{id}/tasks`, `GET /tasks/{id}` | Service and HTTP acceptance tests |
| TASK-02 | Authorized users can update and delete tasks | `PATCH/DELETE /tasks/{id}` | RBAC, concealed-resource, and optimistic-lock tests |
| TASK-03 | Task status follows explicit allowed transitions | `PATCH /tasks/{id}/status` | Domain transition matrix and HTTP 422 test |
| TASK-04 | Owner/admin can assign only current project members | `PATCH /tasks/{id}/assignee` | Cross-project assignee and role tests |
| TASK-05 | Lists support bounded filters, search, stable sort, and cursor pagination | `GET /projects/{id}/tasks`, `GET /tasks/assigned-to-me` | Query-index integration tests and multi-page traversal |
| COMM-01 | Project members can add and list task comments | `POST/GET /tasks/{id}/comments` | Access, validation, ordering, and event tests |
| FILE-01 | Member can request a bounded private upload intent | `POST /tasks/{id}/attachments/upload-intents` | Authorization, size/type bounds, signed URL test |
| FILE-02 | Upload confirmation verifies the object before readiness | `POST /tasks/{id}/attachments/complete` | Missing/object-mismatch and success tests |
| FILE-03 | Current members receive short-lived authorized download URLs | `GET /attachments/{id}/download` | Removed/non-member denial and expiry contract |
| FILE-05 | Current members can discover ready task attachments without storage metadata | `GET /tasks/{id}/attachments` | Pagination, concealment, and strict response-shape tests |
| NOTIF-01 | Business mutations persist an outbox intent atomically | Internal transaction | Mongo rollback and event-shape tests |
| NOTIF-02 | Worker leases, retries, and deduplicates delivery | Worker | Crash/restart, expired lease, retry, and duplicate event tests |
| NOTIF-03 | User can reconcile and update a durable notification inbox | Notification REST endpoints | Recipient isolation, pagination, unread/read-all tests |
| NOTIF-04 | Authenticated SSE streams only that user's live notifications | `GET /notifications/stream` | Two-user isolation, heartbeat, disconnect, and REST catch-up tests |
| AI-01 | User can request a bounded description draft without task mutation | `POST /ai/tasks/description-draft` | Permission, quota, malformed provider, timeout, 429 tests |
| AI-02 | User can summarize an accessible task without persistence | `POST /ai/tasks/{id}/summary` | Grounding, access, response validation, provider-failure tests |
| MAIL-01 | Invitation creation produces retryable sandbox email delivery | Invitation workflow | Mailpit integration, retry, redaction, idempotency tests |

## Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| SEC-01 | Project isolation and resource-level authorization on every project-owned resource | Negative IDOR matrix across two projects and three roles |
| SEC-02 | Argon2id passwords, bounded JWT verification, secure refresh cookie, CSRF policy, and secret redaction | Security-focused unit/integration tests and configuration review |
| TYPE-01 | Strict TypeScript with no `any`, unsafe suppression, or unchecked provider payload | `npm run typecheck` and type-aware ESLint gate |
| PERF-01 | Indexed read/list endpoints target local P95 ≤ 300 ms under a documented workload | Repeatable load script and recorded local result; target is not claimed before measurement |
| REL-01 | Graceful shutdown, liveness, readiness, idempotent acceptance, deterministic failures | Process and dependency integration tests |
| OPS-01 | Structured correlated logs; optional OTLP traces/metrics; no sensitive telemetry | Log-redaction and context-propagation tests |
| REPRO-01 | Fresh clone starts with documented prerequisites and no secret material | Clean-clone Docker smoke suite |
| REPO-01 | Public Git contains only assignment deliverables and has inspectable plain history | `git status --ignored`, staged-file, history, and secret scans |

## Role matrix

| Action | Owner | Admin | Member |
|---|---:|---:|---:|
| Read project, members, tasks, comments, attachments | Yes | Yes | Yes |
| Update project | Yes | Yes | No |
| Invite members | Yes | Yes | No |
| Create/update task content and status | Yes | Yes | Yes |
| Assign/unassign tasks | Yes | Yes | No |
| Delete tasks | Yes | Yes | No |
| Comment and attach files | Yes | Yes | Yes |

All resource access additionally requires current membership in the resource's project. Unauthorized resource lookup returns a concealed 404 where revealing existence would cross a project boundary.

## Release cut policy

Mandatory requirements and SEC-01, SEC-02, TYPE-01, REL-01, REPRO-01, and REPO-01 block release. Target integrations may be configured with deterministic mocks when live credentials are absent, but their ports, validation, error behavior, and tests still block release. Deferred features cannot block or weaken a mandatory workflow.
