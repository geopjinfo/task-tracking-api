# Test strategy

## Test levels

- Domain unit tests cover task transitions, role policies, token state, event recipient rules, and value bounds without infrastructure.
- Application-service tests use typed fakes for repositories and providers to prove orchestration, authorization order, failure semantics, and transaction intent.
- Repository contract tests run the same cases against MongoDB adapters, including unique indexes, cursor ordering, optimistic concurrency, and reference scoping.
- HTTP tests run the Express application through Supertest and verify status codes, DTOs, cookies, validation, concealed resources, and stable error codes.
- Integration tests run MongoDB as a replica set, Redis, MinIO, and Mailpit. They prove transactions, outbox leasing, Pub/Sub isolation, object verification, and invitation delivery.
- End-to-end scenarios start from registration and cover project creation, invitation acceptance, task collaboration, attachment access, notification reconciliation, and logout.

## Required negative matrices

Authorization tests create two projects with owner, admin, member, former member, and unrelated user identities. Every project-owned read and mutation is attempted with each relevant identity. Tests must cover guessed identifiers, cross-project assignees, comment and attachment access, notification ownership, and removed membership.

Authentication tests cover normalized duplicate registration, invalid credentials, expired access, refresh rotation, reuse-family revocation, logout, algorithm/issuer/audience rejection, cookie attributes, CSRF behavior, and Redis rate-limit failure policy.

Provider tests never require live credentials. OpenRouter cases include success, malformed JSON, missing content, 429, timeout, upstream 5xx, oversized input/output, and prompt content that attempts to override the system instruction. Mail cases cover Mailpit delivery, provider failure after invitation persistence, retry, and duplicate job execution. Storage cases cover missing objects, size/content mismatch, expired URLs, and unauthorized downloads.

## Fixtures and isolation

Factories generate UUIDv7 identifiers and unique normalized emails. Each integration test owns its database namespace and deletes it after completion. Time, token generation, provider responses, and retry scheduling are injectable or fakeable; assertions do not depend on wall-clock sleeps. No test uses production credentials or an external network.

## Coverage and release gates

Coverage is evidence, not the objective. The minimum target is 80% lines/branches for domain and application code, with every requirement in `REQUIREMENTS.md` linked to at least one named acceptance scenario. Security-critical branches require explicit tests even when aggregate coverage is already met.

Release requires:

1. `npm ci`, strict type checking, type-aware lint, unit tests, integration tests, and production build pass.
2. OpenAPI 3.1 validates and an automated route/contract parity check passes.
3. Docker health and graceful shutdown pass from a fresh clone.
4. IDOR, refresh replay, invitation replay, optimistic concurrency, outbox retry/idempotency, and attachment privacy suites pass.
5. Dependency audit, secret scan, staged-file inspection, ignored-file inspection, and full-history inspection pass.
6. The README documents prerequisites, exact startup, smoke steps, limitations, and provider configuration without secrets.

Live OpenRouter delivery is an optional manual smoke check after the deterministic provider suite. Mailpit is the required local email acceptance environment.
