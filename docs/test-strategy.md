# Test strategy

Unit tests cover policies, validation and token behavior. Integration tests run against a MongoDB replica set and exercise indexes, transactions, authorization and repository queries. HTTP tests cover each user story, malformed input, expired/replayed credentials, IDOR attempts, version conflicts and provider failures.

Release gates are strict type checking, type-aware linting, unit/integration tests, build success, OpenAPI validation, Docker health, a clean-clone smoke flow and repository/secrets inspection. Live OpenRouter credentials are not required; provider success, malformed output, timeout and 429 behavior use deterministic mocks. Mailpit verifies invitation delivery locally.
