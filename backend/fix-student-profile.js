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

    await db.beginTransaction();

    const [rows] = await db.execute(
      `SELECT id, name, registration_no
       FROM students
       WHERE id = 1
       FOR UPDATE`
    );

    if (
      rows.length !== 1 ||
      rows[0].name !== "Akshit Rana PIET25AD006" ||
      rows[0].registration_no !== null
    ) {
      throw new Error(
        "Student record differs from expected values. No changes made."
      );
    }

    await db.execute(
      `UPDATE students
       SET name = ?, registration_no = ?,
           year_of_passing = ?, semester = ?
       WHERE id = 1`,
      ["Akshit Rana", "PIET25AD006", 2029, 3]
    );

    await db.commit();

    console.log("Student profile updated successfully.");
    console.table([{
      name: "Akshit Rana",
      registration_no: "PIET25AD006",
      year_of_passing: 2029,
      semester: 3
    }]);
  } catch (error) {
    if (db) await db.rollback().catch(() => {});
    console.error("Update failed:", error.message);
  } finally {
    if (db) await db.end();
  }
})();
