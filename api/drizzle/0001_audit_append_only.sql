-- The audit log is append-only: no change or removal, whatever the app or a bug tries.
-- Only row-level UPDATE and DELETE are refused; TRUNCATE (which the tests use to reset the
-- database) is a table operation and doesn't fire row triggers.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
