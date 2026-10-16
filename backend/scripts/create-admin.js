require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD,
    INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, INITIAL_ADMIN_PASSWORD } = process.env;
  if (!INITIAL_ADMIN_EMAIL || !INITIAL_ADMIN_NAME || !INITIAL_ADMIN_PASSWORD ||
      INITIAL_ADMIN_PASSWORD === 'replace-me-now') {
    throw new Error('Set INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, and a strong INITIAL_ADMIN_PASSWORD in backend/.env first.');
  }
  if (INITIAL_ADMIN_PASSWORD.length < 14) throw new Error('Temporary admin password must be at least 14 characters.');
  const db = await mysql.createConnection({
    host: DB_HOST, port: Number(DB_PORT || 3306), user: DB_USER,
    password: DB_PASSWORD, database: DB_NAME
  });
  try {
    const [rows] = await db.execute('SELECT id FROM admins WHERE email = ?', [INITIAL_ADMIN_EMAIL.toLowerCase()]);
    if (rows.length) throw new Error('Admin already exists. Do not overwrite an existing admin.');
    const hash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12);
    await db.execute(
      'INSERT INTO admins (email, name, password_hash, must_change_password) VALUES (?, ?, ?, TRUE)',
      [INITIAL_ADMIN_EMAIL.toLowerCase(), INITIAL_ADMIN_NAME, hash]
    );
    console.log('Initial admin created. Log in and change the temporary password immediately.');
  } finally { await db.end(); }
})().catch(err => { console.error(err.message); process.exit(1); });
