-- Legacy-safe migration. The deployed CPGist workspace already owns these tables with integer/bigint IDs.
-- The compatibility migration below adds the current application's columns and tables without changing existing primary-key types.
-- This file intentionally performs only extension setup so fresh and existing databases can advance to the additive schema safely.
create extension if not exists pgcrypto;
