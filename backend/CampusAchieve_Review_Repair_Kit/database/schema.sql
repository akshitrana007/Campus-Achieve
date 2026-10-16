CREATE DATABASE IF NOT EXISTS campus_achieve
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE campus_achieve;

-- Profile fields stay nullable until the student saves the profile on first upload.
CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  google_sub VARCHAR(255) NULL UNIQUE,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  registration_no VARCHAR(100) NULL UNIQUE,
  year_of_passing SMALLINT UNSIGNED NULL,
  semester TINYINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (semester IS NULL OR semester BETWEEN 1 AND 12),
  CHECK (year_of_passing IS NULL OR year_of_passing BETWEEN 2020 AND 2100)
);

-- Kept for compatibility if a roster is used by the institution later.
CREATE TABLE IF NOT EXISTS roster (
  registration_no VARCHAR(100) NOT NULL PRIMARY KEY,
  official_email VARCHAR(320) NULL UNIQUE,
  name VARCHAR(160) NULL,
  year_of_passing SMALLINT UNSIGNED NULL,
  semester TINYINT UNSIGNED NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certificates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  category ENUM('academic','non-academic') NOT NULL,
  event_name VARCHAR(180) NOT NULL,
  event_date DATE NULL,
  original_filename VARCHAR(255) NOT NULL,
  object_key VARCHAR(512) NOT NULL UNIQUE,
  mime_type ENUM('application/pdf','image/jpeg','image/png') NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cert_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_cert_student (student_id, uploaded_at)
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(100) NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at)
);
