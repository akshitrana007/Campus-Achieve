require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2/promise');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const maxBytes = Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;

const allowedMimes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32
) {
  throw new Error(
    'SESSION_SECRET must be at least 32 characters. Set it in backend/.env.'
  );
}

if (!process.env.COLLEGE_EMAIL_DOMAIN) {
  console.warn('Configure COLLEGE_EMAIL_DOMAIN in backend/.env.');
}

// ================= DATABASE =================

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: true }
    : undefined
});

const sessionStore = new MySQLStore({}, db);

// ================= BACKBLAZE S3 STORAGE =================

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-005',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
  }
});

// ================= MIDDLEWARE =================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));

app.use(express.urlencoded({
  extended: false,
  limit: '20kb'
}));

app.use(express.json({
  limit: '20kb'
}));

app.use(session({
  name: 'campus.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, '..', 'frontend')));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ================= GOOGLE STUDENT LOGIN =================

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const emailEntry = (profile.emails || []).find(e => e.verified);

      if (!emailEntry) {
        return done(null, false, {
          message: 'Verified Google email required.'
        });
      }

      const email = emailEntry.value.toLowerCase();

      const domain = (process.env.COLLEGE_EMAIL_DOMAIN || '')
        .toLowerCase()
        .replace(/^@/, '');

      if (!domain || email.split('@').pop() !== domain) {
        return done(null, false, {
          message: 'Use your official college email.'
        });
      }

      const [existing] = await db.execute(
        `SELECT id, email, name, registration_no,
                year_of_passing, semester
         FROM students
         WHERE email = ?`,
        [email]
      );

      if (existing.length > 0) {
        await db.execute(
          'UPDATE students SET google_sub = ? WHERE id = ?',
          [profile.id, existing[0].id]
        );

        return done(null, {
          role: 'student',
          ...existing[0]
        });
      }

      const displayName = profile.displayName || email;

      const [result] = await db.execute(
        `INSERT INTO students (google_sub, email, name)
         VALUES (?, ?, ?)`,
        [profile.id, email, displayName]
      );

      return done(null, {
        role: 'student',
        id: result.insertId,
        email,
        name: displayName,
        registration_no: null,
        year_of_passing: null,
        semester: null
      });

    } catch (err) {
      console.error('Google login database error:', err.message);
      return done(err);
    }
  }));
}

// ================= FILE UPLOAD CONFIGURATION =================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxBytes,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimes.has(file.mimetype)) {
      return cb(
        new Error('Only PDF, JPG, and PNG files are accepted.')
      );
    }

    cb(null, true);
  }
});

// ================= AUTHENTICATION HELPERS =================

function requireStudent(req, res, next) {
  if (req.user?.role !== 'student') {
    return res.status(401).json({
      error: 'Please sign in as a student.'
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(401).json({
      error: 'Administrator login required.'
    });
  }

  next();
}

// ================= AUDIT LOG =================

function audit(adminId, action, targetType, targetId, details = {}) {
  return db.execute(
    `INSERT INTO audit_logs
     (admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      adminId,
      action,
      targetType,
      String(targetId || ''),
      JSON.stringify(details)
    ]
  );
}

// ================= GOOGLE AUTH ROUTES =================

app.get('/auth/google', (req, res, next) => {
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    return res.status(503).send(
      'Google sign-in is not configured.'
    );
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })(req, res, next);
});

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/?login=failed'
  }),
  (req, res) => {
    const authenticatedUser = req.user;

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).send(
          'Could not start a secure session.'
        );
      }

      req.login(authenticatedUser, loginErr => {
        if (loginErr) {
          return res.status(500).send('Login failed.');
        }

        res.redirect('/student.html');
      });
    });
  }
);

// ================= ADMIN LOGIN =================

app.post('/auth/admin/login', async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();

    const password = String(req.body.password || '');

    const [rows] = await db.execute(
      `SELECT id, email, name, password_hash,
              must_change_password, active
       FROM admins
       WHERE email = ?`,
      [email]
    );

    if (
      !rows.length ||
      !rows[0].active ||
      !(await bcrypt.compare(password, rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const admin = rows[0];

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.login({
      role: 'admin',
      id: admin.id,
      email: admin.email,
      name: admin.name,
      mustChangePassword: !!admin.must_change_password
    }, err => {
      if (err) {
        return res.status(500).json({
          error: 'Login failed.'
        });
      }

      db.execute(
        'UPDATE admins SET last_login_at = NOW() WHERE id = ?',
        [admin.id]
      ).catch(() => {});

      res.json({
        ok: true,
        mustChangePassword: !!admin.must_change_password
      });
    });

  } catch (err) {
    console.error('Admin login error:', err.message);

    res.status(500).json({
      error: 'Unable to log in.'
    });
  }
});

// ================= ADMIN CHANGE PASSWORD =================

app.post(
  '/auth/admin/change-password',
  requireAdmin,
  async (req, res) => {
    try {
      const current = String(req.body.currentPassword || '');
      const next = String(req.body.newPassword || '');

      if (next.length < 14) {
        return res.status(400).json({
          error: 'Use a new password with at least 14 characters.'
        });
      }

      const [rows] = await db.execute(
        'SELECT password_hash FROM admins WHERE id = ?',
        [req.user.id]
      );

      if (
        !rows.length ||
        !(await bcrypt.compare(current, rows[0].password_hash))
      ) {
        return res.status(401).json({
          error: 'Current password is incorrect.'
        });
      }

      const hash = await bcrypt.hash(next, 12);

      await db.execute(
        `UPDATE admins
         SET password_hash = ?, must_change_password = FALSE
         WHERE id = ?`,
        [hash, req.user.id]
      );

      await audit(
        req.user.id,
        'admin_password_changed',
        'admin',
        req.user.id
      );

      req.user.mustChangePassword = false;

      res.json({ ok: true });

    } catch (err) {
      console.error('Password update error:', err.message);

      res.status(500).json({
        error: 'Could not change password.'
      });
    }
  }
);

// ================= LOGOUT =================

app.post('/auth/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json({
        error: 'Logout failed.'
      });
    }

    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

// ================= CURRENT USER =================

app.get('/api/me', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false });
  }

  const {
    role,
    id,
    email,
    name,
    registration_no,
    year_of_passing,
    semester,
    mustChangePassword
  } = req.user;

  res.json({
    authenticated: true,
    role,
    id,
    email,
    name,
    registration_no,
    year_of_passing,
    semester,
    mustChangePassword
  });
});

// ================= SAVE STUDENT PROFILE =================

app.post('/api/student/profile', requireStudent, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();

    const registrationNo = String(
      req.body.registration_no || ''
    ).trim();

    const yearOfPassing = Number(req.body.year_of_passing);
    const semester = Number(req.body.semester);

    if (!name || name.length > 100) {
      return res.status(400).json({
        error: 'Please enter a valid name.'
      });
    }

    if (!registrationNo || registrationNo.length > 100) {
      return res.status(400).json({
        error: 'Please enter a valid registration number.'
      });
    }

    if (
      !Number.isInteger(yearOfPassing) ||
      yearOfPassing < 2020 ||
      yearOfPassing > 2100
    ) {
      return res.status(400).json({
        error: 'Please enter a valid passing year.'
      });
    }

    if (
      !Number.isInteger(semester) ||
      semester < 1 ||
      semester > 12
    ) {
      return res.status(400).json({
        error: 'Semester must be between 1 and 12.'
      });
    }

    const [duplicates] = await db.execute(
      `SELECT id FROM students
       WHERE registration_no = ? AND id <> ?`,
      [registrationNo, req.user.id]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        error: 'This registration number is already registered.'
      });
    }

    await db.execute(
      `UPDATE students
       SET name = ?, registration_no = ?,
           year_of_passing = ?, semester = ?
       WHERE id = ?`,
      [
        name,
        registrationNo,
        yearOfPassing,
        semester,
        req.user.id
      ]
    );

    req.user.name = name;
    req.user.registration_no = registrationNo;
    req.user.year_of_passing = yearOfPassing;
    req.user.semester = semester;

    res.json({
      ok: true,
      message: 'Student profile saved successfully.'
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'This registration number is already registered.'
      });
    }

    console.error('Student profile error:', err.message);

    res.status(500).json({
      error: 'Could not save profile. Please try again.'
    });
  }
});

// ================= CERTIFICATE UPLOAD =================

app.post(
  '/api/certificates',
  requireStudent,
  upload.single('certificate'),
  async (req, res) => {
    let uploadedObjectKey = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Choose a certificate file.'
        });
      }

      const category = String(req.body.category || '').trim();
      const eventName = String(req.body.eventName || '').trim();
      const eventDate = String(req.body.eventDate || '').trim() || null;

      const originalFilename = path
        .basename(String(req.file.originalname || 'certificate'))
        .slice(0, 255);

      if (!['academic', 'non-academic'].includes(category)) {
        return res.status(400).json({
          error: 'Choose a valid category.'
        });
      }

      if (!eventName || eventName.length > 180) {
        return res.status(400).json({
          error: 'Enter an event name (up to 180 characters).'
        });
      }

      if (eventDate) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);

        if (!match) {
          return res.status(400).json({
            error: 'Event date must be a valid date in YYYY-MM-DD format.'
          });
        }

        const [, yearText, monthText, dayText] = match;

        const parsed = new Date(Date.UTC(
          Number(yearText),
          Number(monthText) - 1,
          Number(dayText)
        ));

        if (parsed.toISOString().slice(0, 10) !== eventDate) {
          return res.status(400).json({
            error: 'Event date is not a valid calendar date.'
          });
        }
      }

      if (
        !process.env.S3_BUCKET ||
        !process.env.S3_ENDPOINT ||
        !process.env.S3_ACCESS_KEY_ID ||
        !process.env.S3_SECRET_ACCESS_KEY
      ) {
        return res.status(503).json({
          error: 'Private certificate storage is not configured yet.'
        });
      }

      const b = req.file.buffer;

      const validPdf =
        req.file.mimetype === 'application/pdf' &&
        b.subarray(0, 5).toString() === '%PDF-';

      const validJpg =
        req.file.mimetype === 'image/jpeg' &&
        b[0] === 0xff &&
        b[1] === 0xd8 &&
        b[2] === 0xff;

      const validPng =
        req.file.mimetype === 'image/png' &&
        b.subarray(0, 8).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );

      if (!(validPdf || validJpg || validPng)) {
        return res.status(400).json({
          error: 'File content does not match PDF/JPG/PNG format.'
        });
      }

      const ext = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png'
      }[req.file.mimetype];

      const key =
        `certificates/${req.user.id}/${crypto.randomUUID()}.${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ContentLength: req.file.size,
        ServerSideEncryption: 'AES256',
        Metadata: {
          uploadedby: String(req.user.id)
        }
      }));

      uploadedObjectKey = key;

      // FIX: Comma separates the SQL string from the values array.
      await db.execute(
        `INSERT INTO certificates
         (student_id, category, event_name, event_date, file_name,
          original_filename, object_key, mime_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          category,
          eventName,
          eventDate,
          originalFilename,
          originalFilename,
          key,
          req.file.mimetype,
          req.file.size
        ]
      );

      // Keep the file if its database row was successfully saved.
      uploadedObjectKey = null;

      return res.status(201).json({
        ok: true,
        message: 'Certificate uploaded successfully.'
      });

    } catch (err) {
      // Clean up the newly uploaded object if the DB insert fails.
      if (uploadedObjectKey) {
        try {
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: uploadedObjectKey
          }));

          console.warn(
            'Removed orphaned certificate object after DB failure.'
          );

        } catch (cleanupErr) {
          console.error(
            'Could not clean up orphaned certificate object:',
            cleanupErr.message
          );
        }
      }

      console.error('Certificate upload failed:', err.stack || err);

      return res.status(500).json({
        error: 'Upload failed. Please try again or contact the administrator.'
      });
    }
  }
);

// ================= STUDENT CERTIFICATES =================

app.get('/api/my-certificates', requireStudent, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, category, event_name, event_date,
              original_filename, uploaded_at
       FROM certificates
       WHERE student_id = ?
       ORDER BY uploaded_at DESC`,
      [req.user.id]
    );

    res.json(rows);

  } catch (err) {
    console.error('Certificate list error:', err.message);

    res.status(500).json({
      error: 'Could not load certificates.'
    });
  }
});

// ================= VIEW CERTIFICATE FILE =================

app.get('/api/certificates/:id/file', async (req, res) => {
  try {
    if (
      !req.user ||
      !['student', 'admin'].includes(req.user.role)
    ) {
      return res.status(401).json({
        error: 'Sign in required.'
      });
    }

    const [rows] = await db.execute(
      `SELECT c.object_key, c.original_filename,
              c.mime_type, c.student_id
       FROM certificates c
       WHERE c.id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: 'Certificate not found.'
      });
    }

    const cert = rows[0];

    if (
      req.user.role === 'student' &&
      Number(cert.student_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({
        error: 'Not allowed.'
      });
    }

    if (req.user.role === 'admin') {
      await audit(
        req.user.id,
        'certificate_view_link_created',
        'certificate',
        req.params.id
      );
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: cert.object_key,
        ResponseContentType: cert.mime_type,
        ResponseContentDisposition:
          `inline; filename="${String(cert.original_filename || 'certificate')
            .replace(/["\\]/g, '_')}"`
      }),
      {
        expiresIn: Math.min(
          600,
          Math.max(30, Number(process.env.SIGNED_URL_TTL_SECONDS || 120))
        )
      }
    );

    res.json({ url });

  } catch (err) {
    console.error('Certificate file error:', err.message);

    res.status(500).json({
      error: 'Could not open certificate.'
    });
  }
});

// ================= ADMIN STUDENT LIST =================

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.id, s.email, s.registration_no, s.name,
              s.year_of_passing, s.semester,
              COUNT(c.id) AS certificate_count
       FROM students s
       LEFT JOIN certificates c ON c.student_id = s.id
       GROUP BY s.id, s.email, s.registration_no, s.name,
                s.year_of_passing, s.semester`
    );

    rows.sort((a, b) =>
      String(a.registration_no || '').localeCompare(
        String(b.registration_no || '')
      ) ||
      String(a.name || '').localeCompare(
        String(b.name || ''),
        undefined,
        { sensitivity: 'base' }
      )
    );

    res.json(rows);

  } catch (err) {
    console.error('Admin student list error:', err.message);

    res.status(500).json({
      error: 'Could not load students.'
    });
  }
});

// ================= ADMIN STUDENT CERTIFICATES =================

app.get(
  '/api/admin/students/:id/certificates',
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT c.id, c.category, c.event_name, c.event_date,
                c.original_filename, c.uploaded_at
         FROM certificates c
         WHERE c.student_id = ?
         ORDER BY c.uploaded_at DESC`,
        [req.params.id]
      );

      await audit(
        req.user.id,
        'student_certificates_listed',
        'student',
        req.params.id
      );

      res.json(rows);

    } catch (err) {
      console.error('Admin certificate list error:', err.message);

      res.status(500).json({
        error: 'Could not load student certificates.'
      });
    }
  }
);
// ================= MANAGE ADMINS =================

// List all admin accounts for the dashboard
app.get('/api/admin/admins', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, name, email, active
       FROM admins
       ORDER BY name ASC, email ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error('Admin list error:', err.message);
    res.status(500).json({
      error: 'Could not load admin accounts.'
    });
  }
});

// Create a new admin account
app.post('/api/admin/admins', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password || '');

    if (!name || name.length > 100) {
      return res.status(400).json({
        error: 'Enter a name of up to 100 characters.'
      });
    }

    if (
      !email ||
      email.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        error: 'Enter a valid email address.'
      });
    }

    if (password.length < 14) {
      return res.status(400).json({
        error: 'Password must contain at least 14 characters.'
      });
    }

    const [existing] = await db.execute(
      'SELECT id FROM admins WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: 'An admin with this email already exists.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.execute(
      `INSERT INTO admins
       (name, email, password_hash, must_change_password, active)
       VALUES (?, ?, ?, FALSE, TRUE)`,
      [name, email, passwordHash]
    );

    // Logging failure must not make a successfully created account
    // appear to have failed.
    try {
      await audit(
        req.user.id,
        'admin_created',
        'admin',
        result.insertId,
        { email }
      );
    } catch (auditError) {
      console.error('Admin creation audit error:', auditError.message);
    }

    res.status(201).json({
      ok: true,
      message: 'New admin account created successfully.'
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'An admin with this email already exists.'
      });
    }

    console.error('Admin creation error:', err.message);

    res.status(500).json({
      error: 'Could not create the admin account.'
    });
  }
});
// ================= PAGES AND HEALTH =================

app.get('/admin', (_req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'frontend', 'admin-login.html')
  );
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ================= ERROR HANDLER =================

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE'
        ? `Maximum file size is ${process.env.MAX_FILE_SIZE_MB || 10} MB.`
        : 'Invalid upload.'
    });
  }

  if (err) {
    console.error('Request error:', err.message);

    return res.status(400).json({
      error: err.message || 'Request failed.'
    });
  }

  res.status(500).json({
    error: 'Unexpected server error.'
  });
});

// ================= START SERVER =================

app.listen(port, () => {
  console.log(`CampusAchieve running on http://localhost:${port}`);
});