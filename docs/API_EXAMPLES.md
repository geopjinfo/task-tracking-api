# API examples

The examples assume `API=http://localhost:3000/api/v1`. Replace identifiers and tokens with values returned by your environment.

## Register and authenticate

```sh
curl -i "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","displayName":"Owner","password":"correct horse battery staple"}'
```

The response contains an access token and sets an HTTP-only `refresh_token` cookie. Store the access token in the client process as `TOKEN`.

## Create a project and task

```sh
curl "$API/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Delivery","description":"Release work"}'

curl "$API/projects/$PROJECT_ID/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Prepare release","description":"Run the release gates"}'
```

## Update with optimistic concurrency

```sh
curl -X PATCH "$API/tasks/$TASK_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress","version":1}'
```

Use the version returned by the latest task response. A stale version returns `409`.

## Follow notifications

```sh
curl -N "$API/notifications/stream" \
  -H "Authorization: Bearer $TOKEN"
```

SSE is a live hint. After connecting or reconnecting, query `GET /notifications` for the durable inbox.

## Request an AI suggestion

```sh
curl "$API/ai/tasks/description-draft" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"'$PROJECT_ID'","title":"Prepare release","context":"Focus on verification"}'
```

The response is an unpersisted suggestion. Saving it requires an explicit task create or update request.
