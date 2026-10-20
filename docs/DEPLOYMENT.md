# Deployment and rollback

## Release inputs

A release consists of one immutable application image used by both the HTTP API and background worker, the validated environment contract, and the MongoDB index bootstrap performed during startup. MongoDB must be a replica set. Redis is disposable coordination state. Attachment storage must be private and S3-compatible. SMTP and OpenRouter credentials are external secrets.

The local MinIO server/client package is pinned by OCI digest from GHCR because the former Docker Hub release tag is no longer pullable. Treat the digest as a reviewed dependency and update it only through the normal dependency review and integration-test process; production may use any private S3-compatible service through the same port.

Before deployment, run:

```sh
npm ci
npm run check
npm run build
npm audit --omit=dev --audit-level=critical
docker compose config --quiet
docker compose build
```

Inspect the image user and scan the final image with the deployment platform's vulnerability scanner. The supplied image runs as the unprivileged `node` user.

## Deployment order

1. Back up MongoDB and confirm the restore procedure and retention window.
2. Ensure MongoDB, Redis, private object storage, SMTP, and optional OTLP endpoints are reachable through restricted networks.
3. Apply secrets through the platform secret store. Never bake `.env` into the image.
4. Run `npm run migrate` as a deployment step, then start one worker and one API instance. Startup also applies pending migrations idempotently and fails before readiness when required dependencies are unavailable.
5. Confirm `/health/live` and `/health/ready`, then run registration, project, task, attachment, invitation email, notification, and mocked-AI smoke checks.
6. Add API replicas only after the first instance passes. Workers safely coordinate through leased MongoDB jobs.

## Public HTTPS ingress

Caddy is the only public production service. Create an A and/or AAAA DNS record for the API hostname pointing to the server, allow inbound TCP 80 and 443 plus UDP 443, and keep MongoDB, Redis, MinIO, Mailpit, API, worker, and telemetry ports closed externally. Set `DOMAIN` to that hostname and provide a non-placeholder `JWT_SECRET` of at least 32 characters alongside the other production credentials in `.env`; Compose refuses to render the production overlay when either required value is absent.

```sh
docker compose -f compose.yaml -f compose.prod.yaml config
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

Caddy obtains and renews the public certificate automatically. The API uses `TRUST_PROXY=1`, which trusts only the directly connected Caddy hop; do not increase it unless another controlled proxy is added. Caddy caps request bodies at 2 MB, while Express retains its stricter 1 MB JSON limit. `flush_interval -1` disables proxy response buffering for SSE.

After readiness, verify routing, security headers, the SSE connection, and reconnection with `CADDY_BASE_URL=https://api.example.com npm run proxy:smoke`. For a local ingress test without public DNS, set `CADDY_SITE_ADDRESS=:80` and `DOMAIN=localhost`, then use `CADDY_BASE_URL=http://localhost`; this validates routing and streaming but not public certificate issuance.

## Backup and recovery

Back up MongoDB with a replica-set-consistent snapshot or `mongodump` using deployment-managed credentials. Back up the private object bucket with versioning or provider snapshots. Redis does not require recovery for correctness. Restore into an isolated environment first, check indexes and referential counts, then exercise the end-to-end smoke suite before promoting the restored data.

Run `npm run restore:smoke` against the Compose stack to create an isolated MongoDB record and MinIO object, back them up, remove the originals, restore them, verify both, and clean up. Record the command, date, and result for each release candidate. This smoke validates mechanics; production retention, encryption, and off-site storage remain deployment-provider responsibilities.

## Rollback

Applied versions, checksums, timestamps, and durations are recorded in `schema_migrations`; `schema_migration_lock` provides a renewable-scope execution lease. Migration `001 initial-schema` is additive and idempotent, while `002 strengthen-document-validators` tightens database shape checks and can restore the original validator level on deliberate rollback. CI applies all pending migrations against a fresh replica set and verifies status before tests. To roll back application code, stop new worker claims, route traffic to the previous immutable image, start its compatible worker, and verify readiness plus core flows. Use `npm run migrate:down` only as a deliberate schema rollback after backup and compatibility review. If a future release introduces destructive change, it must ship a separately tested batched backfill, forward-fix, and restore plan before deployment.

Pending outbox and email jobs remain in MongoDB during a rollback. Leases expire after 30 seconds and can be reclaimed by a compatible worker. Failed jobs retain stable error codes for investigation. Redis loss only affects limits and live fan-out; notification history remains durable.

## Incident checks

- API unready: check MongoDB and Redis connectivity, configuration validation, and index creation errors.
- Worker backlog: inspect pending/processing leases and stable failure codes; do not edit payloads manually.
- Attachment failures: check bucket existence, credentials, clock skew, object metadata, and private-access policy.
- Mail failures: check SMTP reachability and sender configuration; invitations remain valid while jobs retry.
- AI failures: disable the key or provider route if needed; core task workflows continue without AI.

## Optional observability profile

The `observability` Compose profile adds an OTLP collector, Tempo trace storage, Promtail-to-Loki log shipping, Prometheus, and Grafana with provisioned data sources. Set `OTEL_ENABLED=true` and point `OTEL_EXPORTER_OTLP_ENDPOINT` at the collector to emit traces. Application logs continue to stdout and are shipped asynchronously; telemetry failure never becomes a request or worker dependency. The production overlay removes host port bindings from every telemetry service; administration must use a private authenticated path. Production deployments should pin image versions, set retention, and use durable storage appropriate to their environment.
