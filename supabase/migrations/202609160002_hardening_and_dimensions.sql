-- Legacy-safe hardening migration. Dimension security is applied by the additive compatibility migration.
-- Keep this migration idempotent for workspaces that started from the original CPG schema.
create extension if not exists pgcrypto;
