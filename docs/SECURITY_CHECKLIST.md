# Production security checklist

- [ ] College owns hosting, database, OAuth, domain, and object-storage accounts.
- [ ] Real college email domain configured; roster enforcement enabled.
- [ ] Official roster checked and imported by authorized staff.
- [ ] Admin initial password changed; no secrets stored in source control.
- [ ] HTTPS enabled; secure cookies enabled via `NODE_ENV=production`.
- [ ] Database and storage credentials have least privilege.
- [ ] Object bucket is private; signed URLs expire quickly.
- [ ] Database backups and certificate-file backups configured and restore-tested.
- [ ] File upload size, MIME, and signature checks tested.
- [ ] Rate limits and security headers enabled.
- [ ] Unauthorized cross-student access tests passed.
- [ ] Admin access reviewed and inactive accounts disabled.
- [ ] Privacy notice, retention policy, and student consent reviewed by the college.
- [ ] Error logs do not expose passwords, tokens, or certificate contents.
- [ ] College IT has reviewed session, CSRF, OAuth, and deployment configuration before launch.

This checklist is a baseline, not a formal security certification.
