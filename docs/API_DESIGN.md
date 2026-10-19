# API design

The API prefix is `/api/v1`. Successful creates use 201, reads and updates 200, deletes 204. Errors use `{ error: { code, message, details?, requestId } }`. Validation is 422; authentication 401; concealed unauthorized resources 404; concurrency 409; rate limits 429; provider failures 502 or 503.

Bearer access tokens protect application routes. Refresh and logout use the HTTP-only refresh cookie. List endpoints are bounded to 100 items and return `nextCursor`. AI endpoints never persist generated content. SSE sends heartbeats and clients reconcile durable notifications through REST after reconnecting.

## Conventions

- Media type is `application/json`; SSE uses `text/event-stream`.
- UUIDv7 identifiers are serialized as UUID strings. Dates are UTC ISO-8601 strings.
- Unknown object properties are rejected for security-sensitive inputs.
- An absent optional property means no change; `null` is accepted only where the contract explicitly clears a value.
- Collection responses use `{items,nextCursor}`. Cursors are opaque and bound to the selected sort/filter shape.
- Maximum page size is 100 and default is 20.
- Mutating task requests include the expected positive `version`; a stale version returns 409 `VERSION_CONFLICT`.
- `X-Request-Id` is accepted when bounded and echoed; otherwise the server generates it.

## Authentication and cookies

Registration/login return an access token and set `refresh_token` as HttpOnly, SameSite=Lax, path `/api/v1/auth`; production sets Secure. Refresh and logout require the cookie and the configured CSRF evidence. Protected endpoints use `Authorization: Bearer <access-token>`. Persistent access/refresh tokens are never accepted in URLs.

## Error taxonomy

| Status | Meaning | Representative codes |
|---|---|---|
| 400 | malformed JSON/syntax | `MALFORMED_JSON` |
| 401 | identity/session absent or invalid | `AUTH_REQUIRED`, `INVALID_ACCESS_TOKEN`, `INVALID_CREDENTIALS`, `REFRESH_REUSE_DETECTED` |
| 403 | visible resource but action denied | `FORBIDDEN`, `CSRF_INVALID` |
| 404 | unknown or concealed cross-project resource | `RESOURCE_NOT_FOUND`, `TASK_NOT_FOUND` |
| 409 | unique/state/version conflict | `EMAIL_EXISTS`, `VERSION_CONFLICT` |
| 410 | expired invitation | `INVITATION_EXPIRED` |
| 422 | parsed but invalid input/domain transition | `VALIDATION_ERROR`, `INVALID_STATUS_TRANSITION` |
| 429 | rate/quota exhausted | `RATE_LIMITED`, `AI_QUOTA_EXCEEDED` |
| 502 | upstream rejected or malformed | `PROVIDER_ERROR` |
| 503 | required dependency unavailable | `DEPENDENCY_UNAVAILABLE`, `AI_UNAVAILABLE` |

Errors never contain stack traces, database messages, provider bodies, credentials, object keys, or signed URLs beyond successful attachment responses.

## Endpoint inventory

| Method | Path | Requirement | Authorization |
|---|---|---|---|
| POST | `/auth/register` | AUTH-01 | public + rate limit |
| POST | `/auth/login` | AUTH-02 | public + rate limit |
| POST | `/auth/refresh` | AUTH-03 | refresh cookie + CSRF + rate limit |
| POST | `/auth/logout` | AUTH-04 | refresh cookie + CSRF |
| GET/PATCH | `/users/me` | USER-01 | authenticated user |
| POST/GET | `/projects` | PROJ-01/02 | authenticated user |
| GET/PATCH | `/projects/{projectId}` | PROJ-02/03 | member / owner-admin |
| GET | `/projects/{projectId}/members` | MEM-03 | member |
| POST | `/projects/{projectId}/invitations` | MEM-01 | owner/admin |
| POST | `/invitations/{token}/accept` | MEM-02 | authenticated matching email |
| POST/GET | `/projects/{projectId}/tasks` | TASK-01/05 | member |
| GET | `/tasks/assigned-to-me` | TASK-05 | authenticated user |
| GET/PATCH/DELETE | `/tasks/{taskId}` | TASK-01/02 | member / owner-admin delete |
| PATCH | `/tasks/{taskId}/status` | TASK-03 | member |
| PATCH | `/tasks/{taskId}/assignee` | TASK-04 | owner/admin |
| POST/GET | `/tasks/{taskId}/comments` | COMM-01 | member |
| POST | `/tasks/{taskId}/attachments/upload-intents` | FILE-01 | member |
| POST | `/tasks/{taskId}/attachments/complete` | FILE-02 | member |
| GET | `/attachments/{attachmentId}/download` | FILE-03 | current member |
| GET | `/notifications` | NOTIF-03 | recipient |
| GET | `/notifications/unread-count` | NOTIF-03 | recipient |
| PATCH | `/notifications/{notificationId}/read` | NOTIF-03 | recipient |
| PATCH | `/notifications/read-all` | NOTIF-03 | recipient |
| GET | `/notifications/stream` | NOTIF-04 | recipient; SSE connection cap |
| POST | `/ai/tasks/description-draft` | AI-01 | project member + quota |
| POST | `/ai/tasks/{taskId}/summary` | AI-02 | task project member + quota |

Invitation email is an asynchronous consequence of invitation creation, not a separate public endpoint.

## Filtering and sorting

Project task lists accept `status`, `assigneeId`, `search`, `sort=createdAt|dueDate`, `order=asc|desc`, `limit`, and `cursor`. Text search uses MongoDB text semantics, not arbitrary substring matching. Unsupported text-relevance/sort combinations are rejected rather than silently changing meaning. Assigned-to-me fixes the assignee to the authenticated user.

## Attachment contract

Upload intent accepts `fileName`, allowed `contentType`, and positive size up to 10 MB. It returns `attachmentId`, `uploadUrl`, required upload headers, and expiry seconds. Confirmation accepts only the attachment ID and verifies the object. Download returns a short-lived URL and expiry after current authorization.

## Notification stream contract

The stream responds with `connected`, `notification`, and optional `error` events plus comment heartbeats. Each `notification` data field is a JSON notification DTO. Disconnect releases Redis subscription and connection count. Clients always fetch the durable inbox after connection/reconnection; `Last-Event-ID` replay is not promised in this release.

## AI contract

Description drafting accepts project ID, bounded title, and bounded context. Summary derives task/comments server-side from `taskId`. Responses contain generated text, configured model identifier, and `persisted:false`. Provider keys, raw provider responses, token accounting internals, and prompts are not returned.

## Contract verification

`openapi.yaml` is the normative wire contract. CI validates OpenAPI 3.1 syntax and compares registered method/path pairs with the specification. Supertest acceptance cases validate representative success and every documented error family. Implementation DTOs may be generated or manually typed, but discrepancies fail the release gate.
