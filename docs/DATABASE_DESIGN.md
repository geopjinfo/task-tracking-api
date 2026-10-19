# Database design

All IDs are UUIDv7 strings and timestamps are UTC dates. Collections are `users`, `sessions`, `projects`, `memberships`, `invitations`, `tasks`, `comments`, `attachments`, `notifications`, and `outbox_events`.

Unique indexes enforce normalized user email, refresh token hash, invitation token hash, `(projectId,userId)` membership and notification delivery key. Task listing uses `(projectId,createdAt desc,id desc)` and a text index on title and description. Notification inboxes use `(recipientId,createdAt desc,id desc)`; workers claim `(status,availableAt,leaseUntil)`.

References are validated in application services because MongoDB has no foreign keys. Invitation acceptance and project creation use transactions. Cursor pagination uses stable fields plus ID. The one-collection-per-logical-table shape permits a later SQL adapter, but query and migration work would still be required.
