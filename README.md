# Task Tracking API

Backend API for collaborative project and task tracking. It uses Express 5, strict TypeScript, MongoDB, Redis, MinIO, Mailpit and optional OpenTelemetry export.

## Local setup

1. Copy `.env.example` to `.env` and replace `JWT_SECRET`. Add `OPENROUTER_API_KEY` only when testing live AI requests.
2. Run `docker compose up --build`.
3. Open Mailpit at `http://localhost:8025`. The API is at `http://localhost:3000/api/v1`.

The optional monitoring services start with `docker compose --profile observability up --build`. They are not required by the API.

## Quality checks

Run `npm ci`, then `npm run check` and `npm run build`. Health endpoints are `/health/live` and `/health/ready`.

## Security notes

Access tokens are returned to the client; refresh tokens use an HTTP-only cookie. Production deployments must enable secure cookies and HTTPS. Attachments are private and accessed using short-lived signed URLs after project authorization. Provider keys and user secrets must never be committed.
