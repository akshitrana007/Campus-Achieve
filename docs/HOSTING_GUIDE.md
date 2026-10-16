# Hosting handover guide

The college IT team should own all production accounts and billing. This repository does not deploy itself.

## Production components
1. Node.js hosting with HTTPS and environment-variable support.
2. Managed MySQL database, private network access where possible, automated backups, and TLS.
3. Private S3-compatible object storage (Cloudflare R2 is one option).
4. College-owned Google OAuth project with production callback URL.
5. College-owned domain and TLS certificate.

## Deployment steps
1. Create a production MySQL database and import `database/schema.sql`.
2. Create a private object-storage bucket. Do not enable public listing or public object access.
3. Create restricted storage credentials scoped to this bucket.
4. Deploy the `backend/` application together with the `frontend/` and configure its working directory/build process as agreed with the hosting provider.
5. Set all variables from `.env.example` in the hosting provider's secret/environment settings. Use the production HTTPS callback URL and `NODE_ENV=production`.
6. Set `DB_SSL=true` where supported by the database provider and configure the provider's required TLS options.
7. Import and verify the official student roster.
8. Create the initial admin using a secure one-time process. Do not leave the temporary password in tickets or email.
9. Verify Google sign-in, student upload, admin listing, file viewing, logout, and unauthorized access.
10. Enable monitoring, alerts, backups, and documented restore tests before launch.

## Important
The sample project serves the frontend and API from one Node.js app. Hosting providers differ in how they build and run apps; the college IT team should test the chosen provider's start command and persistent session/database connectivity before production.
