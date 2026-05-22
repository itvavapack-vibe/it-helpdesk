-- SQL script to set up local MySQL database and user for the it-helpdesk app
-- Edit `your_db_user` and `your_db_password` before running, or pass values via CLI

CREATE DATABASE IF NOT EXISTS helpdsk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'your_db_user'@'localhost' IDENTIFIED BY 'your_db_password';
GRANT ALL PRIVILEGES ON helpdsk_db.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;

-- To apply the schema, run the schema file (from repo root):
-- mysql -u your_db_user -p helpdsk_db < schema_mysql.sql

-- If you run this as root, you can import the schema afterwards:
-- mysql -u root -p < scripts/setup_local_mysql.sql

-- NOTE: Replace placeholders before running in production environments.
