/**
 * CampusAchieve: non-destructive migration for the existing local certificates table.
 * Run from the backend folder: node repair-campusachieve-db.js
 * Reads backend/.env; never prints credentials or certificate content.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    throw new Error('DB_HOST, DB_USER, and DB_NAME must be set in backend/.env');
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
  });

  try {
    const [[dbInfo]] = await db.query('SELECT DATABASE() AS database_name');
    console.log(`Connected database: ${dbInfo.database_name}`);
    if (dbInfo.database_name !== 'campus_achieve') {
      throw new Error(`Refusing to modify unexpected database "${dbInfo.database_name}". Expected "campus_achieve".`);
    }

    const [tables] = await db.query("SHOW TABLES LIKE 'certificates'");
    if (tables.length === 0) {
      throw new Error('Table `certificates` does not exist. Do not run this against another database; first import the project schema.');
    }

    async function columns() {
      const [rows] = await db.query('SHOW COLUMNS FROM certificates');
      return new Map(rows.map(row => [row.Field, row]));
    }

    let current = await columns();
    const requiredColumns = [
      ['event_date', 'DATE NULL'],
      ['original_filename', 'VARCHAR(255) NULL'],
      ['object_key', 'VARCHAR(512) NULL'],
      ['mime_type', "ENUM('application/pdf','image/jpeg','image/png') NULL"],
      ['file_size', 'BIGINT UNSIGNED NULL']
    ];

    for (const [name, definition] of requiredColumns) {
      if (!current.has(name)) {
        await db.query(`ALTER TABLE certificates ADD COLUMN \`${name}\` ${definition}`);
        console.log(`Added missing column: ${name}`);
      } else {
        console.log(`Already present: ${name}`);
      }
    }

    // Old versions of CampusAchieve stored the filename in a required `file_name`
    // column. The current API uses `original_filename` and doesn't insert `file_name`.
    // Leave the legacy column/data in place but make it nullable so new inserts work.
    current = await columns();
    const legacy = current.get('file_name');
    if (legacy && legacy.Null === 'NO' && legacy.Default === null && !String(legacy.Extra || '').includes('auto_increment')) {
      const legacyType = String(legacy.Type || '');
      if (!/^[a-zA-Z]+(?:\(\d+(?:,\d+)?\))?(?: unsigned)?$/i.test(legacyType)) {
        throw new Error(`Legacy file_name has an unexpected type (${legacyType}); no change was made to that column.`);
      }
      await db.query(`ALTER TABLE certificates MODIFY COLUMN \`file_name\` ${legacyType} NULL`);
      console.log('Fixed legacy column: file_name is now nullable (existing values preserved).');
    } else if (legacy) {
      console.log('Legacy file_name column does not block inserts; no change needed.');
    } else {
      console.log('No legacy file_name column found; no change needed.');
    }

    // Preserve old filename information where the old column still has it.
    current = await columns();
    if (current.has('file_name') && current.has('original_filename')) {
      const oldType = String(current.get('file_name').Type || '').toLowerCase();
      if (/^(varchar|char|text|tinytext|mediumtext|longtext)/.test(oldType)) {
        const [result] = await db.query(
          "UPDATE certificates SET original_filename = file_name WHERE (original_filename IS NULL OR original_filename = '') AND file_name IS NOT NULL AND file_name <> ''"
        );
        if (result.affectedRows > 0) console.log(`Recovered old filenames for ${result.affectedRows} existing certificate record(s).`);
      }
    }

    current = await columns();
    console.log('\nFinal certificates columns (name / type / nullable / default):');
    for (const row of current.values()) {
      console.log(`${row.Field} | ${row.Type} | nullable=${row.Null} | default=${row.Default === null ? 'NULL' : String(row.Default)}`);
    }
    console.log('\nMigration complete. No rows or files were deleted.');
    console.log('Do not retry uploads yet if the app is still running; restart it first, then try exactly one sample upload.');
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exitCode = 1;
});
