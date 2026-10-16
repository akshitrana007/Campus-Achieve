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

    const [rows] = await db.execute(
      `SELECT id, name, registration_no, year_of_passing, semester
       FROM students
       ORDER BY id DESC
       LIMIT 10`
    );

    console.table(rows);
  } catch (error) {
    console.error("Database error:", error.message);
  } finally {
    if (db) await db.end();
  }
})();
