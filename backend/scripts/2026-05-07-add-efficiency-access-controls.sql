-- Performance Sales
-- Incremental access-control changes for efficiency manager/seller assignments.
-- Technical reason:
-- 1. Keep the existing monthly efficiency model compatible with current data.
-- 2. Persist an explicit user -> seller relation without introducing destructive migrations.
-- 3. Preserve current manager -> group assignments and allow reference metadata for administration.

ALTER TABLE performance_efficiency_groups
  ADD COLUMN IF NOT EXISTS manager_user_email VARCHAR(255) NULL DEFAULT NULL AFTER manager_user_id;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_id BIGINT NULL DEFAULT NULL AFTER seller_name;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_name VARCHAR(255) NULL DEFAULT NULL AFTER seller_user_id;

ALTER TABLE performance_efficiency_members
  ADD COLUMN IF NOT EXISTS seller_user_email VARCHAR(255) NULL DEFAULT NULL AFTER seller_user_name;

SET @idx_eff_member_user_exists := (
  SELECT COUNT(*)
    FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'performance_efficiency_members'
     AND index_name = 'idx_eff_member_user'
);

SET @idx_eff_member_user_sql := IF(
  @idx_eff_member_user_exists = 0,
  'ALTER TABLE performance_efficiency_members ADD INDEX idx_eff_member_user (seller_user_id)',
  'SELECT ''idx_eff_member_user already exists'''
);

PREPARE stmt_idx_eff_member_user FROM @idx_eff_member_user_sql;
EXECUTE stmt_idx_eff_member_user;
DEALLOCATE PREPARE stmt_idx_eff_member_user;