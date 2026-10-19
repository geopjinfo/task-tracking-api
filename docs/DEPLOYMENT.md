# Deployment and rollback

## Release inputs

A release consists of one immutable application image used by both the HTTP API and background worker, the validated environment contract, and the MongoDB index bootstrap performed during startup. MongoDB must be a replica set. Redis is disposable coordination state. Attachment storage must be private and S3-compatible. SMTP and OpenRouter credentials are external secrets.

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
4. Start one worker and one API instance. Startup creates idempotent indexes and fails before readiness when required dependencies are unavailable.
5. Confirm `/health/live` and `/health/ready`, then run registration, project, task, attachment, invitation email, notification, and mocked-AI smoke checks.
6. Add API replicas only after the first instance passes. Workers safely coordinate through leased MongoDB jobs.

## Backup and recovery

Back up MongoDB with a replica-set-consistent snapshot or `mongodump` using deployment-managed credentials. Back up the private object bucket with versioning or provider snapshots. Redis does not require recovery for correctness. Restore into an isolated environment first, check indexes and referential counts, then exercise the end-to-end smoke suite before promoting the restored data.

## Rollback

Application changes in this release are backward-compatible additions and idempotent indexes; there is no destructive migration. To roll back, stop new worker claims, route traffic to the previous immutable image, start its compatible worker, and verify readiness plus core flows. Do not delete collections or indexes during an incident. If a future release introduces a destructive migration, it must ship a separately tested forward-fix and restore plan before deployment.

Pending outbox and email jobs remain in MongoDB during a rollback. Leases expire after 30 seconds and can be reclaimed by a compatible worker. Failed jobs retain stable error codes for investigation. Redis loss only affects limits and live fan-out; notification history remains durable.

## Incident checks

- API unready: check MongoDB and Redis connectivity, configuration validation, and index creation errors.
- Worker backlog: inspect pending/processing leases and stable failure codes; do not edit payloads manually.
- Attachment failures: check bucket existence, credentials, clock skew, object metadata, and private-access policy.
- Mail failures: check SMTP reachability and sender configuration; invitations remain valid while jobs retry.
- AI failures: disable the key or provider route if needed; core task workflows continue without AI.

## Optional observability profile

The `observability` Compose profile adds an OTLP collector, Tempo trace storage, Promtail-to-Loki log shipping, Prometheus, and Grafana with provisioned data sources. Set `OTEL_ENABLED=true` and point `OTEL_EXPORTER_OTLP_ENDPOINT` at the collector to emit traces. Application logs continue to stdout and are shipped asynchronously; telemetry failure never becomes a request or worker dependency. Production deployments should pin image versions, authenticate Grafana, restrict telemetry ports, set retention, and use durable storage appropriate to their environment.
