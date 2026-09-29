CREATE FUNCTION protect_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 target := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 PERFORM 1 FROM public.workspaces WHERE id=target FOR UPDATE;
 IF TG_OP <> 'DELETE' AND NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=target AND kind='company') THEN RAISE EXCEPTION 'DEMO_NOT_MEMBERSHIP'; END IF;
 IF TG_OP='UPDATE' AND (NEW.workspace_id<>OLD.workspace_id OR NEW.user_id<>OLD.user_id) THEN RAISE EXCEPTION 'MEMBERSHIP_IDENTITY_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.role<>'OWNER') THEN
   IF OLD.role='OWNER' AND NOT EXISTS(SELECT 1 FROM public.memberships WHERE workspace_id=target AND role='OWNER' AND user_id<>OLD.user_id) THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER membership_guard BEFORE INSERT OR UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION protect_membership();
