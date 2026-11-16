-- Every design document must carry a positive integer schemaVersion so
-- clients can upgrade old documents and recognise newer ones (ADR 0007).
--
-- Expand-only and backward compatible: all clients already write
-- schemaVersion: 1. Added NOT VALID first so the table isn't locked while
-- existing rows are checked, then validated.
--
-- Rollback: supabase/rollback/20261116000000_design_schema_version_check_down.sql

alter table public.designs
  add constraint designs_document_schema_version_check
  check (
    case
      when jsonb_typeof(document -> 'schemaVersion') = 'number' then
        (document ->> 'schemaVersion')::numeric >= 1
        and (document ->> 'schemaVersion')::numeric
          = trunc((document ->> 'schemaVersion')::numeric)
      else false
    end
  ) not valid;

alter table public.designs
  validate constraint designs_document_schema_version_check;
