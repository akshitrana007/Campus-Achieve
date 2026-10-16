require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  let db;

  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    const [rows] = await db.execute(`
      SELECT id, event_name, category, original_filename
      FROM certificates
      WHERE LOWER(event_name) LIKE '%hak%'
         OR LOWER(original_filename) LIKE '%hak%'
      ORDER BY id DESC
    `);

    console.table(rows);
  } catch (error) {
    console.error("Database error:", error.message);
  } finally {
    if (db) await db.end();
  }
})();
