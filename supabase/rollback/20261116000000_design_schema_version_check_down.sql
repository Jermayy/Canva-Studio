-- Reverts 20261116000000_design_schema_version_check.sql. Safe at any time:
-- removing a check constraint loses no data.
alter table public.designs
  drop constraint if exists designs_document_schema_version_check;
