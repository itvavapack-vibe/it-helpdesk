-- MySQL schema for IT Helpdesk application
-- Run with: mysql -u user -p your_database < schema_mysql.sql

SET FOREIGN_KEY_CHECKS = 0;

-- Admin users (for admin panel)
CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255),
  signature MEDIUMTEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'it',
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_at DATETIME,
  password_changed_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_security_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  max_failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
  password_max_age_days SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  login_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO admin_security_settings (id, max_failed_login_attempts, password_max_age_days, login_timeout_minutes)
VALUES (1, 3, 90, 5)
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- Change Requests (FMIT 15)
CREATE TABLE IF NOT EXISTS change_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(64) NOT NULL UNIQUE,

  req_type VARCHAR(32) NOT NULL,
  req_type_other VARCHAR(255),
  request_category VARCHAR(255),
  department VARCHAR(255) NOT NULL,
  details TEXT NOT NULL,
  reason TEXT NOT NULL,

  requester_name VARCHAR(255) NOT NULL,
  employee_id VARCHAR(6),
  requester_position VARCHAR(255) NOT NULL,
  requester_sign MEDIUMTEXT,
  attachments_json LONGTEXT,

  manager_name VARCHAR(255),
  manager_position VARCHAR(255),
  manager_sign MEDIUMTEXT,
  manager_date DATETIME,

  status VARCHAR(50) NOT NULL DEFAULT 'Pending_Manager',
  cancelled_at DATETIME,
  cancel_reason TEXT,
  cancel_it_name VARCHAR(255),
  cancel_it_sign MEDIUMTEXT,

  it_received_date DATE,
  it_target_date DATE,
  it_operation_date DATE,
  it_approval_status VARCHAR(32),
  it_reject_reason TEXT,

  it_manager_name VARCHAR(255),
  it_manager_position VARCHAR(255),
  it_manager_sign MEDIUMTEXT,
  it_manager_date DATETIME,
  it_supervisor_name VARCHAR(255),
  it_supervisor_position VARCHAR(255),
  it_supervisor_sign MEDIUMTEXT,
  it_supervisor_date DATETIME,
  it_solution TEXT,

  it_staff_name VARCHAR(255),
  it_staff_position VARCHAR(255),
  it_staff_sign MEDIUMTEXT,
  it_staff_date DATETIME,

  user_acceptance VARCHAR(32),
  user_reject_reason TEXT,
  user_accept_sign MEDIUMTEXT,
  user_accept_date DATETIME,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_change_requests_ticket ON change_requests(ticket_number);
CREATE INDEX idx_change_requests_status ON change_requests(status);
CREATE INDEX idx_change_requests_department ON change_requests(department);
CREATE INDEX idx_change_requests_employee_id ON change_requests(employee_id);

-- Access Requests (FMIT 12)
CREATE TABLE IF NOT EXISTS access_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(64) NOT NULL UNIQUE,
  name_th VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  employee_id VARCHAR(6),
  department VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  internal_phone VARCHAR(64),
  systems JSON,
  other_system_details TEXT,
  request_details TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending_Manager',
  cancelled_at DATETIME,
  cancel_reason TEXT,
  cancel_it_name VARCHAR(255),
  cancel_it_sign MEDIUMTEXT,
  requester_sign MEDIUMTEXT,

  manager_sign MEDIUMTEXT,
  manager_date DATETIME,

  it_manager_sign MEDIUMTEXT,
  it_manager_date DATETIME,
  it_manager_name VARCHAR(255),
  it_manager_position VARCHAR(255),
  it_supervisor_sign MEDIUMTEXT,
  it_supervisor_date DATETIME,
  it_supervisor_name VARCHAR(255),
  it_supervisor_position VARCHAR(255),
  it_staff_name VARCHAR(255),
  it_staff_sign MEDIUMTEXT,
  it_staff_date DATETIME,
  action_result TEXT,
  user_acknowledge_sign MEDIUMTEXT,
  user_acknowledge_date DATETIME,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_requests_ticket ON access_requests(ticket_number);
CREATE INDEX idx_access_requests_status ON access_requests(status);
CREATE INDEX idx_access_requests_employee_id ON access_requests(employee_id);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_id VARCHAR(6) NOT NULL UNIQUE,
  name_th VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  status VARCHAR(64) NOT NULL,
  end_date DATE,
  transfer_date DATE,
  resignation_link VARCHAR(1024),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_employees_emp_id ON employees(emp_id);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(status);

-- Assets (synced from GLPI)
CREATE TABLE IF NOT EXISTS assets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  glpi_id INT NOT NULL UNIQUE,
  name VARCHAR(512),
  serial VARCHAR(128),
  otherserial VARCHAR(128),
  users_id VARCHAR(255),
  locations_id VARCHAR(128),
  computermodels_id VARCHAR(255),
  computertypes_id VARCHAR(255),
  states_id VARCHAR(64),
  autoupdatesystems_id VARCHAR(128),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_assets_glpi_id ON assets(glpi_id);
CREATE INDEX idx_assets_name ON assets(name);

-- GLPI Users (synced)
CREATE TABLE IF NOT EXISTS glpi_users (
  id INT NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  realname VARCHAR(255),
  firstname VARCHAR(255),
  formattedName VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Issues / tickets
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  severity VARCHAR(64),
  description TEXT,
  status VARCHAR(64) DEFAULT 'Pending',
  repair_details TEXT,
  assigned_admin VARCHAR(255),
  asset_id INT,
  asset_name VARCHAR(512),
  asset_type VARCHAR(255),
  asset_location VARCHAR(512),
  operation_started_at DATETIME,
  budget DECIMAL(12,2),
  attachments_json LONGTEXT,
  user_close_name VARCHAR(255),
  user_close_position VARCHAR(255),
  user_close_note TEXT,
  user_close_sign MEDIUMTEXT,
  user_closed_at DATETIME,
  inspector_name VARCHAR(255),
  inspector_position VARCHAR(255),
  inspector_sign MEDIUMTEXT,
  inspector_signed_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_asset_id ON issues(asset_id);

SET FOREIGN_KEY_CHECKS = 1;
