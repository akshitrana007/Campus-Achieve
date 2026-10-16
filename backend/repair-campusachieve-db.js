require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [[info]] = await db.query('SELECT DATABASE() AS dbname');

    if (info.dbname !== 'campus_achieve') {
      throw new Error('Wrong database. No changes made.');
    }

    const [tables] = await db.query(
      "SHOW TABLES LIKE 'certificates'"
    );

    if (!tables.length) {
      throw new Error('certificates table not found');
    }

    let [rows] = await db.query('SHOW COLUMNS FROM certificates');
    let cols = new Map(rows.map(r => [r.Field, r]));

    const required = [
      ['event_date', 'DATE NULL'],
      ['original_filename', 'VARCHAR(255) NULL'],
      ['object_key', 'VARCHAR(512) NULL'],
      ['mime_type', "ENUM('application/pdf','image/jpeg','image/png') NULL"],
      ['file_size', 'BIGINT UNSIGNED NULL']
    ];

    for (const [name, type] of required) {
      if (!cols.has(name)) {
        await db.query(
          `ALTER TABLE certificates ADD COLUMN \`${name}\` ${type}`
        );
        console.log('Added:', name);
      } else {
        console.log('Already exists:', name);
      }
    }

    [rows] = await db.query('SHOW COLUMNS FROM certificates');
    cols = new Map(rows.map(r => [r.Field, r]));

    const old = cols.get('file_name');

    if (old && old.Null === 'NO' && old.Default === null) {
      const type = String(old.Type);

      if (!/^[a-zA-Z]+(?:\(\d+(?:,\d+)?\))?(?: unsigned)?$/i.test(type)) {
        throw new Error('Unexpected file_name column type; stopped safely.');
      }

      await db.query(
        `ALTER TABLE certificates MODIFY COLUMN file_name ${type} NULL`
      );
      console.log('Fixed old mandatory file_name column.');
    }

    console.log('Migration complete. Existing rows were not deleted.');
  } finally {
    await db.end();
  }
})().catch(err => {
  console.error('Migration error:', err.message);
  process.exitCode = 1;
});
