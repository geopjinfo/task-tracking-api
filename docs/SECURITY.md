# Security model

## Trust boundaries

HTTP input, cookies, bearer tokens, object metadata, Redis messages, SMTP state, and OpenRouter responses are untrusted. Authentication establishes a user identity; project membership and action-specific policies establish authorization. MongoDB is the durable source of truth. Redis, SSE, SMTP, object storage, and AI providers cannot grant access or change business state directly.

## Controls

| Threat | Control | Verification |
|---|---|---|
| Credential theft | Argon2id password hashes; opaque hashed refresh tokens; 15-minute signed access tokens; secure cookie requirement in production | Identity integration and configuration tests |
| Refresh replay | Rotation with family reuse detection and family revocation | Refresh replay integration test |
| Cookie request forgery | SameSite=Lax cookies plus exact trusted `Origin` on refresh and logout | Missing and mismatched origin tests |
| Cross-project access and IDOR | Project-scoped repository lookups and application-service membership checks; concealed 404 responses | Two-project negative authorization matrix |
| Brute-force authentication | Redis per-IP limiter that fails closed when Redis is unavailable | Limit and dependency-failure tests |
| Browser attack surface | Exact credentialed CORS origin, Helmet security headers, no framework disclosure, bounded JSON body | HTTP security-control tests |
| Unsafe attachments | Private bucket, generated keys, MIME/size bounds, object metadata confirmation, current-membership check before signed download | Attachment integration tests |
| Injection and malformed providers | Zod validation at HTTP and provider boundaries; fixed AI instruction separated from serialized data; HTML escaping for mail URLs | Validation, provider, and mail tests |
| Secret or token disclosure | Structured redaction for authorization, cookies, password/token fields, provider keys, signed URLs; no raw AI prompt persistence | Logger tests and repository secret scan |
| Event duplication or loss | Mongo transactional outbox, unique delivery keys, leases, bounded retry, REST reconciliation | Notification rollback, retry, and duplicate tests |

## Operational policy

Production requires HTTPS, `COOKIE_SECURE=true`, a non-placeholder JWT secret, private network access to MongoDB and Redis, restricted storage credentials, and externally managed provider secrets. Logs must be access-controlled and retained according to deployment policy. Backups must be encrypted and restoration tested before release.

Dependency scanning fails the release gate for critical production vulnerabilities. Secret scanning checks the complete Git history. Findings are fixed or documented with an owner, impact assessment, expiry date, and compensating control; silent exceptions are not accepted.

## Known boundaries

Access JWTs are not denylisted and remain valid until their short expiry. SMTP is at-least-once across a crash after provider acceptance. Redis Pub/Sub is live fan-out only, so reconnecting clients reconcile against MongoDB. The local Mailpit, MinIO, and observability services are development tools and must not be exposed publicly.
