# Apple Calendar ↔ RM OS tasks

Admin-only CalDAV account, configured in **Задачи → Apple Календарь**. No iCloud credentials, OAuth token or RM OS login password is used. Each administrator has one revocable 256-bit device secret (only SHA-256 is stored); rotating it disconnects all prior devices. Credentials are displayed once in the authenticated UI and never read back by Assistant tools. `mine` restricts both reads and writes to assigned tasks; `all` includes all ordinary tasks.

The account exposes one collection of open, dated staff tasks. Timed tasks are serialized in UTC from Moscow times; dated tasks without time are all-day events. Completing, unassigning (in mine mode), removing a deadline or deleting a task in RM OS removes its calendar resource on the next fetch. Stable UID/ETag prevents duplicates when dates change. Existing recurrence continues through RM OS's task-completion flow, not an Apple RRULE.

Apple can edit title, description and date/time, or create a one-day task assigned to the account owner. Removing an event clears its deadline; it never deletes the business task. Checklist, assignee, completion, finance tasks, recurring series, invitations and multi-day events remain in RM OS. Other Apple calendars are not accessed. Per-event alarms are not synchronized.

Authentication rechecks enabled credential, role and auth-account state each request. Writes use a service-only SQL RPC, credential-version check, row locks, expected `updated_at`, and atomic audit. Both HTTP ETag and database CAS protect concurrent RM OS changes. Stale writes are rejected, not merged blindly. Preview and production share the DB, so never test with fictional business records on preview.

Discovery: `/.well-known/caldav` → `/api/public/caldav/`; principal/home `/api/public/caldav/{userId}/`, collection `tasks/`. Apple advanced setup: HTTPS host, port 443, principal path above, user ID and separate device password. Supported requests: OPTIONS, PROPFIND (depth 0/1), calendar-query (VEVENT and date range), calendar-multiget, GET/HEAD, conditional PUT/DELETE. Unsupported recurring/invitation writes, collection changes and other reports are rejected. No sync-token advertised: clients use ctag + ETag reconciliation. Device fetch schedule controls latency; no instant-push claim.

Migration: `20261030120000_task_caldav.sql`, additive private tables and service-only functions. Caddy well-known redirect is included in the normal update.

Validation:

```sh
node --import tsx --test scripts/tests/apple-calendar.test.ts
PGLITE_MODULE=/tmp/rm-scheduled-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/tests/apple-calendar-db.mjs
npm run build
```

Final native Apple Calendar compatibility must be verified after the owner adds the account on their device. Automated protocol and database tests do not substitute for that check. A real Apple account has not been added automatically.
