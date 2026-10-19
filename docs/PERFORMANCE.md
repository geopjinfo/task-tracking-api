# Local performance smoke test

The release target is P95 at or below 300 ms for indexed list/read endpoints under a documented local workload. This is a smoke target, not a production capacity claim.

Run the API and its dependencies, then execute:

```sh
npm run load:smoke
```

The script registers an isolated user, creates one project and 100 tasks, then sends 200 task-list requests in batches of 20. It reports P50, P95, P99, MongoDB documents and keys examined, and the winning query stage. Test records are removed afterward. Set `API_BASE_URL` or `LOAD_MONGODB_URI` when the API or MongoDB is not exposed on the default local ports.

The release record must contain the exact command, host conditions, timestamp, result JSON, and any target miss. A target miss blocks a performance claim but should be investigated through the recorded explain plan before changing indexes.

## Recorded release smoke

- Timestamp: 2026-10-19, Asia/Dubai
- Command: `npm run load:smoke`
- Host conditions: local Windows Docker Desktop stack; containerized Node 22 API, MongoDB 8 replica set and Redis 8; 200 requests at concurrency 20 over loopback
- Result: P50 51.90 ms, P95 72.13 ms, P99 78.03 ms
- Explain: `projectId_1_createdAt_-1_id_-1`; 20 keys and 20 documents examined for 20 returned rows

The measured P95 passed the 300 ms local smoke target. This result describes only the stated local workload and is not a production capacity guarantee.
