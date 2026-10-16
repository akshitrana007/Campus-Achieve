# CampusAchieve review and repair notes

## Immediate local database blocker
The current backend inserts `event_date`, `original_filename`, `object_key`, `mime_type`, and `file_size`. The live database was an older version with a required `file_name` column. Since the current INSERT does not use `file_name`, MySQL rejected the insert with `Field 'file_name' doesn't have a default value`.

`repair-campusachieve-db.js` is a non-destructive migration for the existing `campus_achieve` DB. It checks/adds missing certificate metadata columns, changes the obsolete `file_name` field to nullable when necessary, and backfills `original_filename` from `file_name` where possible. It prints column names/types but never prints secrets. Run it from the backend folder: `node repair-campusachieve-db.js`.

## Source/schema mismatches found
1. `CREATE TABLE IF NOT EXISTS` does not alter existing tables. That is why the server and live DB drifted as the code evolved.
2. The older uploaded ZIP is not the latest source: its `student.html`/`student.js` do not include the newer profile-at-first-upload workflow; its earlier backend also uses a roster-driven login. Do not send that old ZIP as the final handover without rebuilding it from the current project folder.
3. The older `database/schema.sql` defined `students.registration_no`, `year_of_passing`, and `semester` as NOT NULL, while the newer backend creates the student record at first Google login before these fields are supplied. The corrected `database/schema.sql` in this kit makes those fields nullable and uses a 100-character registration number consistent with the current profile validation. Use this for a fresh database only; `CREATE TABLE IF NOT EXISTS` does not migrate existing `students` tables.
4. In the current upload flow, the file is sent to object storage before the metadata INSERT. If the INSERT fails, the browser still reports failure but the stored object can remain in the bucket without a matching DB record. Repeated attempts may therefore have created orphan files. Do not delete the whole bucket. After a successful fix, compare stored object keys against `certificates.object_key` and remove only confirmed orphan objects.
5. The Backblaze endpoint and `S3_REGION` must both match the B2 bucket region. Do not put the new application key in chat, source control, or the ZIP. The previously shared key should stay revoked.
6. The `npm audit` warning is separate from this upload bug. Do not use `npm audit fix --force` during this repair; it can introduce breaking dependency changes.

## Before hosting
- Rebuild the ZIP from the actual current project folder after local tests pass.
- Ensure `.env` is excluded from the ZIP and `.gitignore` excludes it.
- Confirm the production DB schema matches current source, test Google OAuth callback URL on the production HTTPS domain, private object download permissions, and admin workflows.
- Update `.env.example` and hosting documentation to reflect the storage provider actually chosen, or clearly document both R2 and Backblaze configuration.
