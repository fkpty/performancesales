const pool = require('./connection');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS performance_sales_upload_batches (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    report_type       ENUM('it','xerox') NOT NULL,
    report_month      DATE            NOT NULL,
    filename          VARCHAR(500)    NOT NULL,
    sheet_name        VARCHAR(255)    NOT NULL DEFAULT '',
    records_imported  INT             NOT NULL DEFAULT 0,
    errors_count      INT             NOT NULL DEFAULT 0,
    error_details     JSON            NULL,
    uploaded_by       BIGINT          NULL,
    is_active         TINYINT(1)      NOT NULL DEFAULT 1,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ps_batch_type_month (report_type, report_month, is_active),
    INDEX idx_ps_batch_created_at (created_at),
    INDEX idx_ps_batch_uploaded_by (uploaded_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS performance_sales_rows (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_id              BIGINT UNSIGNED NOT NULL,
    report_type           ENUM('it','xerox') NOT NULL,
    report_month          DATE            NOT NULL,
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
    INDEX idx_ps_rows_invoice (invoice_number),
    INDEX idx_ps_rows_serial (serial_number),
    INDEX idx_ps_rows_business (business_unit)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS contract_series (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS client_code VARCHAR(100) NOT NULL DEFAULT '' AFTER id",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_status VARCHAR(255) NOT NULL DEFAULT '' AFTER status",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS business_div_name VARCHAR(255) NOT NULL DEFAULT '' AFTER source_status",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS charge_fixed DECIMAL(15,2) NULL DEFAULT NULL AFTER business_div_name",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS box_fee DECIMAL(15,2) NULL DEFAULT NULL AFTER charge_fixed",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS service_fee DECIMAL(15,2) NULL DEFAULT NULL AFTER box_fee",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS annual_total DECIMAL(15,2) NULL DEFAULT NULL AFTER monthly_revenue",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS duration_months INT NULL AFTER contract_type",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS commercial_owner_code VARCHAR(100) NOT NULL DEFAULT '' AFTER profitability",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_type ENUM('vigente','vencido') NOT NULL DEFAULT 'vigente' AFTER risk_score",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_report ENUM('vigentes','vencidos_cancelados','desconocido') NOT NULL DEFAULT 'desconocido' AFTER source_type",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_sheet VARCHAR(255) NOT NULL DEFAULT '' AFTER source_report",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_row_number INT UNSIGNED NULL AFTER source_sheet",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS special_source_group TINYINT(1) NOT NULL DEFAULT 0 AFTER source_row_number",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS canonical_key VARCHAR(512) NOT NULL DEFAULT '' AFTER special_source_group",
  "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS data_quality JSON NULL AFTER canonical_key",
  "ALTER TABLE contracts MODIFY COLUMN monthly_revenue DECIMAL(15,2) NULL DEFAULT NULL",
  "ALTER TABLE contracts MODIFY COLUMN profitability DECIMAL(6,2) NULL DEFAULT NULL COMMENT 'Percentage 0-100'",
  'ALTER TABLE contracts ADD INDEX idx_source_type (source_type)',
];

async function ensureSchema() {
  for (const statement of STATEMENTS) {
    try {
      await pool.query(statement);
    } catch (error) {
      if (!isIgnorableSchemaError(error)) {
        throw error;
      }
    }
  }
}

function isIgnorableSchemaError(error) {
  return [
    'ER_DUP_FIELDNAME',
    'ER_DUP_KEYNAME',
    'ER_CANT_DROP_FIELD_OR_KEY',
  ].includes(error?.code);
}

module.exports = ensureSchema;