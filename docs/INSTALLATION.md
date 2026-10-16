# Installation guide

## 1. Install prerequisites
Install Node.js 20+ and MySQL 8+. Ask college IT for a development database user. Do not use the MySQL root account for the application.

## 2. Create database
Run `database/schema.sql` in MySQL. For production, the college should create a dedicated database and least-privilege application user.

## 3. Configure environment
Copy `.env.example` to `backend/.env`. Fill in database details, a random `SESSION_SECRET`, the exact official college email domain, Google OAuth credentials, and private object-storage credentials. Never commit `backend/.env`.

## 4. Google OAuth
In Google Cloud Console, create an OAuth consent configuration and Web application OAuth client. Add the exact authorized redirect URI from `GOOGLE_CALLBACK_URL`. For local testing use `http://localhost:3000/auth/google/callback`. For production use the college's HTTPS domain. Keep the client secret private.

## 5. Import the roster
For each authorized student, insert a roster row containing the official registration number, official college email, full name, year of passing, and semester. Keep `ENFORCE_ROSTER=true` for production. The roster should be verified by college staff before use.

Example:
```sql
INSERT INTO roster (registration_no, official_email, name, year_of_passing, semester)
VALUES ('PIET25AD006', 'student@college.example.edu', 'Sample Student', 2027, 3);
```
Replace example values with verified college records only.

## 6. Install and start
```bash
cd backend
npm install
npm run create-admin
npm run dev
```
Open `http://localhost:3000`. Use the configured initial admin email/password and change the temporary password immediately.

## 7. Check before accepting real uploads
- Test that a student cannot view another student's file.
- Test that a non-college Google account is rejected.
- Test that a college email not in the roster is rejected.
- Test invalid file extensions, spoofed file content, and oversized files.
- Test admin login, password change, logout, and session expiry.
- Test backup and restore in a separate environment.
