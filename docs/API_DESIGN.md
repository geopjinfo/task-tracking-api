# API design

The API prefix is `/api/v1`. Successful creates use 201, reads and updates 200, deletes 204. Errors use `{ error: { code, message, details?, requestId } }`. Validation is 422; authentication 401; concealed unauthorized resources 404; concurrency 409; rate limits 429; provider failures 502 or 503.

Bearer access tokens protect application routes. Refresh and logout use the HTTP-only refresh cookie. List endpoints are bounded to 100 items and return `nextCursor`. AI endpoints never persist generated content. SSE sends heartbeats and clients reconcile durable notifications through REST after reconnecting.
