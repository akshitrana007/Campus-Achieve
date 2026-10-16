require("dotenv").config();

const mysql = require("mysql2/promise");
const readline = require("node:readline");

let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  bcrypt = require("bcrypt");
}

const ask = (question) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;

    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(new Error("Use the VS Code integrated terminal for hidden password input."));
      return;
    }

    readline.emitKeypressEvents(input);
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();

    let value = "";

    const cleanup = () => {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
    };

    const onKeypress = (char, key) => {
      if (key && key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }

      if (key && key.name === "return") {
        cleanup();
        resolve(value);
        return;
      }

      if (key && key.name === "backspace") {
        value = value.slice(0, -1);
        process.stdout.write("\b \b");
        return;
      }

      if (char && !(key && (key.ctrl || key.meta))) {
        value += char;
        process.stdout.write("*");
      }
    };

    input.on("keypress", onKeypress);
  });
}

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

    const [existing] = await db.execute(
      "SELECT id FROM admins LIMIT 1"
    );

    if (existing.length > 0) {
      console.log("An admin account already exists. No account was created.");
      return;
    }

    const email = (await ask("Initial admin email: ")).toLowerCase();
    const name = await ask("Admin name: ");

    if (!email || !email.includes("@") || !name) {
      throw new Error("Enter a valid email and a non-empty name.");
    }

    const password = await askHidden("Choose password (14+ characters): ");

    if (password.length < 14) {
      throw new Error("Password must be at least 14 characters.");
    }

    const confirmation = await askHidden("Re-enter password: ");

    if (password !== confirmation) {
      throw new Error("Passwords do not match.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.execute(
      `INSERT INTO admins
       (email, name, password_hash, must_change_password, active)
       VALUES (?, ?, ?, 0, 1)`,
      [email, name, passwordHash]
    );

    console.log("Initial admin created successfully.");
    console.log("Now open http://localhost:3000/admin and log in.");
  } catch (error) {
    console.error("Could not create initial admin:", error.message);
  } finally {
    if (db) await db.end();
  }
})();
