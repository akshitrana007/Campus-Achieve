# Database and storage guide

## Tables
- `roster`: authoritative student allowlist supplied by the college.
- `students`: student profile linked to a verified Google identity.
- `certificates`: metadata only; certificate bytes live in private object storage.
- `admins`: teacher/admin password hashes and account state.
- `audit_logs`: records important administrator actions.

## Certificate storage
Files are uploaded to a private S3-compatible bucket. The database stores the object key, not the file contents. The app generates short-lived signed URLs after checking the signed-in user's permissions.

## Backups
Back up the MySQL database and object-storage bucket. A database-only backup does not include certificate files. Perform periodic restore tests and document who can access backups.
