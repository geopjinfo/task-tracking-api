# Low-level design

Requests pass through correlation context, structured logging, JSON bounds, authentication, Zod validation, application policy and persistence. Controllers translate HTTP; services and policies own use cases; infrastructure owns MongoDB, Redis, storage, mail and AI details.

Task updates include an expected `version`. MongoDB updates match both ID and version and increment atomically; no match produces HTTP 409. Invitation acceptance validates token hash, email, status and expiry, then writes membership and acceptance in one transaction.

Refresh tokens are random opaque values stored only as SHA-256 hashes. Rotation marks the prior token used. Presenting a used token revokes its family. `AsyncLocalStorage.run` scopes request and identity correlation across asynchronous work.

Attachment creation stores pending metadata and returns a ten-minute upload URL. Confirmation verifies the object before marking it ready. Download performs current membership authorization before returning a five-minute URL.

External responses are parsed from `unknown`. OpenRouter receives bounded context and returns an unpersisted draft. Email failure is logged and does not roll back invitation creation.
