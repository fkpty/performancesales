-- Performance Sales Database Schema
-- Run this ONCE to set up the performance_sales_db database

CREATE DATABASE IF NOT EXISTS performance_sales_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE performance_sales_db;

-- ============================================================
-- Sessions issued by the PHP auth bridge
-- ============================================================
CREATE TABLE IF NOT EXISTS contractos_sessions (
  token        CHAR(64)     NOT NULL PRIMARY KEY,
  user_id      BIGINT       NOT NULL,
  user_name    VARCHAR(255) NOT NULL,
  user_email   VARCHAR(255) NOT NULL,
  user_roles_json JSON      NULL,
  can_upload_reports TINYINT(1) NOT NULL DEFAULT 0,
  expires_at   DATETIME     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_code        VARCHAR(100)    NOT NULL DEFAULT '',
  client             VARCHAR(255)    NOT NULL,
  contract_name      VARCHAR(255)    NOT NULL DEFAULT '',
  contract_type      VARCHAR(255)    NOT NULL DEFAULT '',
  duration_months    INT             NULL,
  start_date         DATE            NULL,
  end_date           DATE            NULL,
  cancellation_date  DATE            NULL,
  canonical_status   ENUM('VIGENTE','VENCIDO','CANCELADO') NOT NULL DEFAULT 'VIGENTE',
  cancellation_reason VARCHAR(255)   NOT NULL DEFAULT '',
  status             ENUM('ACTIVE','AT RISK','LOST','RENEWED') NOT NULL DEFAULT 'ACTIVE',
  source_status      VARCHAR(255)    NOT NULL DEFAULT '',
  business_div_name  VARCHAR(255)    NOT NULL DEFAULT '',
  charge_fixed       DECIMAL(15,2)   NULL DEFAULT NULL,
  box_fee            DECIMAL(15,2)   NULL DEFAULT NULL,
  service_fee        DECIMAL(15,2)   NULL DEFAULT NULL,
  monthly_revenue    DECIMAL(15,2)   NULL DEFAULT NULL,
  annual_total       DECIMAL(15,2)   NULL DEFAULT NULL,
  profitability      DECIMAL(6,2)    NULL DEFAULT NULL COMMENT 'Percentage 0-100',
  commercial_owner_code VARCHAR(100) NOT NULL DEFAULT '',
  commercial_owner   VARCHAR(255)    NOT NULL DEFAULT '',
  risk_score         DECIMAL(7,4)    NOT NULL DEFAULT 0  COMMENT '0-100 score for AT RISK contracts',
  source_type        ENUM('vigente','vencido') NOT NULL DEFAULT 'vigente',
  source_report      ENUM('vigentes','vencidos_cancelados','desconocido') NOT NULL DEFAULT 'desconocido',
  source_sheet       VARCHAR(255)    NOT NULL DEFAULT '',
  source_row_number  INT UNSIGNED    NULL,
  special_source_group TINYINT(1)    NOT NULL DEFAULT 0,
  canonical_key      VARCHAR(512)    NOT NULL DEFAULT '',
  data_quality       JSON            NULL,
  upload_batch_id    BIGINT UNSIGNED NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status      (status),
  INDEX idx_canonical_status (canonical_status),
  INDEX idx_source_type (source_type),
  INDEX idx_end_date    (end_date),
  INDEX idx_start_date  (start_date),
  INDEX idx_client      (client),
  INDEX idx_batch       (upload_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_code VARCHAR(100) NOT NULL DEFAULT '' AFTER id;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_name VARCHAR(255) NOT NULL DEFAULT '' AFTER client;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months INT NULL AFTER contract_type;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS cancellation_date DATE NULL AFTER end_date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS canonical_status ENUM('VIGENTE','VENCIDO','CANCELADO') NOT NULL DEFAULT 'VIGENTE' AFTER cancellation_date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NOT NULL DEFAULT '' AFTER canonical_status;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_status VARCHAR(255) NOT NULL DEFAULT '' AFTER status;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_div_name VARCHAR(255) NOT NULL DEFAULT '' AFTER source_status;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS charge_fixed DECIMAL(15,2) NULL DEFAULT NULL AFTER business_div_name;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS box_fee DECIMAL(15,2) NULL DEFAULT NULL AFTER charge_fixed;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS service_fee DECIMAL(15,2) NULL DEFAULT NULL AFTER box_fee;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS annual_total DECIMAL(15,2) NULL DEFAULT NULL AFTER monthly_revenue;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_type ENUM('vigente','vencido') NOT NULL DEFAULT 'vigente' AFTER risk_score;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_report ENUM('vigentes','vencidos_cancelados','desconocido') NOT NULL DEFAULT 'desconocido' AFTER risk_score;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_sheet VARCHAR(255) NOT NULL DEFAULT '' AFTER source_report;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_row_number INT UNSIGNED NULL AFTER source_sheet;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS special_source_group TINYINT(1) NOT NULL DEFAULT 0 AFTER source_row_number;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS canonical_key VARCHAR(512) NOT NULL DEFAULT '' AFTER special_source_group;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS data_quality JSON NULL AFTER canonical_key;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commercial_owner_code VARCHAR(100) NOT NULL DEFAULT '' AFTER profitability;
ALTER TABLE contracts MODIFY COLUMN monthly_revenue DECIMAL(15,2) NULL DEFAULT NULL;
ALTER TABLE contracts MODIFY COLUMN profitability DECIMAL(6,2) NULL DEFAULT NULL COMMENT 'Percentage 0-100';

-- ============================================================
-- Contract series detail synced from SQL Server
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_series (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  segment               VARCHAR(255)    NOT NULL DEFAULT '',
  billing_zone          VARCHAR(100)    NOT NULL DEFAULT '',
  price_mode            VARCHAR(100)    NOT NULL DEFAULT '',
  client_code           VARCHAR(100)    NOT NULL DEFAULT '',
  client                VARCHAR(255)    NOT NULL DEFAULT '',
  contract_name         VARCHAR(255)    NOT NULL DEFAULT '',
  contract_type         VARCHAR(100)    NOT NULL DEFAULT '',
  frequency             VARCHAR(100)    NOT NULL DEFAULT '',
  duration_months       INT             NULL,
  start_date            DATE            NULL,
  end_date              DATE            NULL,
  equipment_series      VARCHAR(150)    NOT NULL DEFAULT '',
  model                 VARCHAR(150)    NOT NULL DEFAULT '',
  product               VARCHAR(150)    NOT NULL DEFAULT '',
  accessory             VARCHAR(100)    NOT NULL DEFAULT '',
  min_copies            DECIMAL(15,2)   NULL DEFAULT NULL,
  min_color_copies      DECIMAL(15,2)   NULL DEFAULT NULL,
  charge_fixed          DECIMAL(15,2)   NULL DEFAULT NULL,
  box_fee               DECIMAL(15,2)   NULL DEFAULT NULL,
  service_fee           DECIMAL(15,2)   NULL DEFAULT NULL,
  average_copies        DECIMAL(15,2)   NULL DEFAULT NULL,
  scale_type            VARCHAR(100)    NOT NULL DEFAULT '',
  scale_number          INT             NULL,
  scale_from            DECIMAL(15,2)   NULL DEFAULT NULL,
  scale_to              DECIMAL(15,2)   NULL DEFAULT NULL,
  scale_price_per_copy  DECIMAL(15,6)   NULL DEFAULT NULL,
  invoice_literal       VARCHAR(255)    NOT NULL DEFAULT '',
  installation_address  VARCHAR(500)    NOT NULL DEFAULT '',
  phone1                VARCHAR(100)    NOT NULL DEFAULT '',
  phone2                VARCHAR(100)    NOT NULL DEFAULT '',
  commercial_owner      VARCHAR(255)    NOT NULL DEFAULT '',
  upload_batch_id       BIGINT UNSIGNED NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_series_end_date (end_date),
  INDEX idx_series_client (client),
  INDEX idx_series_contract (contract_name),
  INDEX idx_series_owner (commercial_owner),
  INDEX idx_series_equipment (equipment_series),
  INDEX idx_series_batch (upload_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Upload audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS upload_log (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  filename         VARCHAR(500)    NOT NULL,
  records_imported INT             NOT NULL DEFAULT 0,
  errors_count     INT             NOT NULL DEFAULT 0,
  error_details    JSON            NULL,
  uploaded_by      BIGINT          NULL COMMENT 'hub user_id',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Application settings (key-value store)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  `key`       VARCHAR(100) NOT NULL PRIMARY KEY,
  `value`     TEXT         NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default settings
INSERT IGNORE INTO app_settings (`key`, `value`) VALUES
  ('at_risk_months', '3'),
  ('app_version',    '1.0.0'),
  ('full_view_access_users', '[]');

-- ============================================================
-- Performance Sales monthly uploads
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_sales_upload_batches (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_type       ENUM('it','xerox','postventas') NOT NULL,
  report_month      DATE            NOT NULL COMMENT 'Primer dia del mes del reporte',
  filename          VARCHAR(500)    NOT NULL,
  sheet_name        VARCHAR(255)    NOT NULL DEFAULT '',
  records_imported  INT             NOT NULL DEFAULT 0,
  errors_count      INT             NOT NULL DEFAULT 0,
  error_details     JSON            NULL,
  uploaded_by       BIGINT          NULL COMMENT 'hub user_id',
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ps_batch_type_month (report_type, report_month, is_active),
  INDEX idx_ps_batch_created_at (created_at),
  INDEX idx_ps_batch_uploaded_by (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_sales_rows (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id              BIGINT UNSIGNED NOT NULL,
  report_type           ENUM('it','xerox','postventas') NOT NULL,
  report_month          DATE            NOT NULL COMMENT 'Primer dia del mes del reporte',
  order_number          BIGINT          NULL,
  account_code          VARCHAR(100)    NOT NULL DEFAULT '',
  client_name           VARCHAR(255)    NOT NULL DEFAULT '',
  item_model            VARCHAR(100)    NOT NULL DEFAULT '',
  configuration         VARCHAR(255)    NOT NULL DEFAULT '',
  quantity              DECIMAL(15,2)   NULL DEFAULT NULL,
  revenue               DECIMAL(15,2)   NULL DEFAULT NULL,
  cost_usd              DECIMAL(15,2)   NULL DEFAULT NULL,
  itbm                  DECIMAL(15,2)   NULL DEFAULT NULL,
  acarreo               DECIMAL(15,2)   NULL DEFAULT NULL,
  reacondicionamiento   DECIMAL(15,2)   NULL DEFAULT NULL,
  garantia              DECIMAL(15,2)   NULL DEFAULT NULL,
  provision             DECIMAL(15,2)   NULL DEFAULT NULL,
  total_cost            DECIMAL(15,2)   NULL DEFAULT NULL,
  gross_profit          DECIMAL(15,2)   NULL DEFAULT NULL,
  margin                DECIMAL(10,6)   NULL DEFAULT NULL,
  sale_date             DATE            NULL,
  invoice_number        VARCHAR(100)    NOT NULL DEFAULT '',
  sales_person_name     VARCHAR(255)    NOT NULL DEFAULT '',
  employee_id           VARCHAR(100)    NOT NULL DEFAULT '',
  document_type         VARCHAR(50)     NOT NULL DEFAULT '',
  business_unit         VARCHAR(100)    NOT NULL DEFAULT '',
  sales_mode            VARCHAR(100)    NOT NULL DEFAULT '',
  operation_type        VARCHAR(100)    NOT NULL DEFAULT '',
  serial_number         VARCHAR(150)    NOT NULL DEFAULT '',
  fiscal_sequence       VARCHAR(255)    NOT NULL DEFAULT '',
  raw_payload           JSON            NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ps_rows_batch (batch_id),
  INDEX idx_ps_rows_type_month (report_type, report_month),
  INDEX idx_ps_rows_sale_date (sale_date),
  INDEX idx_ps_rows_client (client_name),
  INDEX idx_ps_rows_owner (sales_person_name),
  INDEX idx_ps_rows_employee (employee_id),
  INDEX idx_ps_rows_invoice (invoice_number),
  INDEX idx_ps_rows_serial (serial_number),
  INDEX idx_ps_rows_business (business_unit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Performance Sales efficiency workbook configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_efficiency_period_settings (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sheet_type            ENUM('sales_productivity','presales') NOT NULL,
  config_month          DATE            NOT NULL COMMENT 'Primer dia del mes configurado',
  report_year           SMALLINT UNSIGNED NOT NULL,
  ytd_month_number      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_by            BIGINT          NULL,
  updated_by            BIGINT          NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eff_period (sheet_type, config_month),
  INDEX idx_eff_period_year (report_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_efficiency_groups (
  id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sheet_type                 ENUM('sales_productivity','presales') NOT NULL,
  config_month               DATE            NOT NULL COMMENT 'Primer dia del mes configurado',
  group_name                 VARCHAR(255)    NOT NULL DEFAULT '',
  manager_name               VARCHAR(255)    NOT NULL DEFAULT '',
  manager_user_id            BIGINT          NULL,
  manager_user_email         VARCHAR(255)    NULL DEFAULT NULL,
  metrics_source             ENUM('sales_upload','manual_monthly') NOT NULL DEFAULT 'sales_upload',
  total_salary_amount        DECIMAL(15,4)   NULL DEFAULT NULL COMMENT 'Valor dentro del parentesis de SALARY FULLY LOADED para el total del grupo',
  total_salary_divisor       DECIMAL(15,4)   NOT NULL DEFAULT 1,
  total_salary_multiplier    DECIMAL(15,4)   NOT NULL DEFAULT 1,
  total_salary_months_mode   ENUM('period','months_in_role','custom') NOT NULL DEFAULT 'period',
  total_salary_months_custom TINYINT UNSIGNED NULL DEFAULT NULL,
  sort_order                 INT             NOT NULL DEFAULT 0,
  created_by                 BIGINT          NULL,
  updated_by                 BIGINT          NULL,
  created_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eff_group (sheet_type, config_month, group_name),
  INDEX idx_eff_group_manager (manager_user_id),
  INDEX idx_eff_group_sort (sheet_type, config_month, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_efficiency_members (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id                BIGINT UNSIGNED NOT NULL,
  sheet_type              ENUM('sales_productivity','presales') NOT NULL,
  config_month            DATE            NOT NULL COMMENT 'Primer dia del mes configurado',
  employee_id             VARCHAR(100)    NOT NULL DEFAULT '',
  seller_name             VARCHAR(255)    NOT NULL DEFAULT '',
  seller_user_id          BIGINT          NULL,
  seller_user_name        VARCHAR(255)    NULL DEFAULT NULL,
  seller_user_email       VARCHAR(255)    NULL DEFAULT NULL,
  market_segment          VARCHAR(255)    NOT NULL DEFAULT '',
  months_in_role_label    VARCHAR(50)     NOT NULL DEFAULT '',
  months_in_role_value    TINYINT UNSIGNED NULL DEFAULT NULL,
  yearly_printing_target  DECIMAL(15,2)   NULL DEFAULT NULL,
  yearly_it_other_target  DECIMAL(15,2)   NULL DEFAULT NULL,
  yearly_rental_target    DECIMAL(15,2)   NULL DEFAULT NULL,
  yearly_total_target     DECIMAL(15,2)   NULL DEFAULT NULL,
  yearly_gp_target_rate   DECIMAL(10,6)   NULL DEFAULT NULL,
  plan_months_mode        ENUM('period','months_in_role','custom') NOT NULL DEFAULT 'period',
  plan_months_custom      TINYINT UNSIGNED NULL DEFAULT NULL,
  salary_amount           DECIMAL(15,4)   NULL DEFAULT NULL COMMENT 'Valor editable dentro del parentesis de SALARY FULLY LOADED',
  salary_divisor          DECIMAL(15,4)   NOT NULL DEFAULT 1,
  salary_multiplier       DECIMAL(15,4)   NOT NULL DEFAULT 1,
  salary_months_mode      ENUM('period','months_in_role','custom') NOT NULL DEFAULT 'period',
  salary_months_custom    TINYINT UNSIGNED NULL DEFAULT NULL,
  is_other_row            TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order              INT             NOT NULL DEFAULT 0,
  created_by              BIGINT          NULL,
  updated_by              BIGINT          NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eff_member (sheet_type, config_month, group_id, seller_name, is_other_row),
  INDEX idx_eff_member_group (group_id),
  INDEX idx_eff_member_lookup (sheet_type, config_month, seller_name),
  INDEX idx_eff_member_user (seller_user_id),
  INDEX idx_eff_member_sort (group_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS performance_efficiency_member_manual_metrics (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sheet_type      ENUM('sales_productivity','presales') NOT NULL,
  config_month    DATE            NOT NULL COMMENT 'Primer dia del mes configurado',
  group_name      VARCHAR(255)    NOT NULL DEFAULT '',
  seller_name     VARCHAR(255)    NOT NULL DEFAULT '',
  metric_month    DATE            NOT NULL COMMENT 'Primer dia del mes capturado',
  revenue         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  gross_profit    DECIMAL(15,2)   NOT NULL DEFAULT 0,
  created_by      BIGINT          NULL,
  updated_by      BIGINT          NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_eff_manual_metric (sheet_type, config_month, group_name, seller_name, metric_month),
  INDEX idx_eff_manual_metric_lookup (sheet_type, config_month, group_name, seller_name),
  INDEX idx_eff_manual_metric_month (metric_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE performance_efficiency_groups
  ADD COLUMN IF NOT EXISTS metrics_source ENUM('sales_upload','manual_monthly') NOT NULL DEFAULT 'sales_upload' AFTER manager_user_id;

ALTER TABLE performance_efficiency_groups
  ADD COLUMN IF NOT EXISTS manager_user_email VARCHAR(255) NULL DEFAULT NULL AFTER manager_user_id;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_id BIGINT NULL DEFAULT NULL AFTER seller_name;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_name VARCHAR(255) NULL DEFAULT NULL AFTER seller_user_id;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_email VARCHAR(255) NULL DEFAULT NULL AFTER seller_user_name;

ALTER TABLE performance_efficiency_members
  ADD INDEX idx_eff_member_user (seller_user_id);
