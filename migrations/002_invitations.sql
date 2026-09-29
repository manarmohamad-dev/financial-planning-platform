CREATE TABLE invitations (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), email text NOT NULL,
 role text NOT NULL CHECK(role IN ('MANAGER','ANALYST')), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_by uuid NOT NULL REFERENCES users(id)
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_access ON invitations FOR ALL USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT SELECT,INSERT ON invitations TO planner_app;
CREATE FUNCTION accept_invitation(invite_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE inv public.invitations; target uuid;
BEGIN
 SELECT workspace_id INTO target FROM public.invitations WHERE token_hash=invite_hash;
 IF target IS NULL THEN RAISE EXCEPTION 'INVITATION_INVALID'; END IF;
 PERFORM 1 FROM public.workspaces WHERE id=target AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_INVALID'; END IF;
 SELECT * INTO inv FROM public.invitations WHERE token_hash=invite_hash FOR UPDATE;
 IF inv.consumed_at IS NOT NULL OR inv.expires_at <= now() OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=public.current_actor() AND email=inv.email) THEN RAISE EXCEPTION 'INVITATION_INVALID'; END IF;
 INSERT INTO public.memberships(workspace_id,user_id,role) VALUES(inv.workspace_id,public.current_actor(),inv.role) ON CONFLICT DO NOTHING;
 UPDATE public.invitations SET consumed_at=now() WHERE id=inv.id;
 RETURN inv.workspace_id;
END $$;
REVOKE ALL ON FUNCTION accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation(text) TO planner_app;
