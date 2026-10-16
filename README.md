# CampusAchieve

A starter implementation for a college certificate-management portal.

## Features
- Student sign-in with Google OAuth (restricted to the configured college email domain).
- Student dashboard with Academic and Non-Academic certificate categories.
- Multiple certificate uploads per student.
- Separate administrator login.
- Admin table: Registration No. | Name | Year of Passing | Semester | Certificates.
- Students are grouped by registration prefix, then sorted by name A–Z.
- MySQL metadata database and private S3-compatible object storage (Cloudflare R2 can be used).
- Setup, deployment, security, and backup documentation.

## Important before real college use
This is a handover-ready starter project, not a substitute for college IT/security review. Do not put real student data into it until the college has configured its own accounts, verified the student roster, reviewed access controls, and tested backup/restore.

## Requirements
- Node.js 20+
- MySQL 8+
- Google Cloud project with OAuth credentials
- S3-compatible private object storage account (for example, Cloudflare R2)

## Quick start
1. Create a MySQL database and run `database/schema.sql`.
2. Copy `.env.example` to `backend/.env` and fill in the college-owned credentials.
3. Install backend packages:
   ```bash
   cd backend
   npm install
   npm run create-admin
   npm run dev
   ```
4. Open `http://localhost:3000`.
5. Configure Google OAuth redirect URI as `http://localhost:3000/auth/google/callback` for local testing.

See `docs/INSTALLATION.md` and `docs/HOSTING_GUIDE.md` for full instructions.

## ZIP handover
Send this complete folder/ZIP to the college IT team. The college should create and own the production hosting, database, OAuth, and object-storage accounts. Never email or commit real `.env` secrets.
