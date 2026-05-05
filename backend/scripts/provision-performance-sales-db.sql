-- Provision isolated database for Performance Sales
-- Run with a MySQL account that has CREATE DATABASE and GRANT privileges.

CREATE DATABASE IF NOT EXISTS performance_sales_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Optional: grant explicit access to the runtime user/host.
-- Replace <app_user> and <app_host> if needed.
-- GRANT ALL PRIVILEGES ON performance_sales_db.* TO '<app_user>'@'<app_host>';
-- FLUSH PRIVILEGES;

-- Then execute backend/src/db/schema.sql or run npm run setup-db from backend.
