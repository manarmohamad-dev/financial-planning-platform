CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, display_name text NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp NOT NULL);
CREATE INDEX sessions_expire ON sessions(expire);
CREATE TABLE workspaces (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('company','demo')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 currency text NOT NULL CHECK(currency IN ('EGP','SAR','USD','AED')),
 created_by uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_demo_per_user ON workspaces(created_by) WHERE kind='demo';
CREATE TABLE memberships (
 workspace_id uuid NOT NULL REFERENCES workspaces(id), user_id uuid NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK(role IN ('OWNER','MANAGER','ANALYST')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
CREATE INDEX memberships_user ON memberships(user_id,workspace_id);
CREATE TABLE planning_drafts (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id),
 payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
CREATE TABLE assumption_versions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id),
 draft_id uuid NOT NULL, draft_revision integer NOT NULL, payload jsonb NOT NULL,
 contract_version text NOT NULL, confirmed_by uuid NOT NULL REFERENCES users(id), confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,draft_id,draft_revision),
 FOREIGN KEY(workspace_id,draft_id) REFERENCES planning_drafts(workspace_id,id)
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL, resource_id uuid, request_id uuid NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX draft_workspace_recent ON planning_drafts(workspace_id,updated_at DESC);
CREATE INDEX version_workspace_recent ON assumption_versions(workspace_id,confirmed_at DESC);
CREATE INDEX audit_workspace_recent ON audit_events(workspace_id,created_at DESC);

CREATE FUNCTION current_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('app.user_id',true),'')::uuid
$$;
CREATE FUNCTION current_workspace() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('app.workspace_id',true),'')::uuid
$$;
CREATE FUNCTION workspace_access(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=target AND
   ((w.kind='demo' AND w.created_by=public.current_actor()) OR
    (w.kind='company' AND EXISTS(SELECT 1 FROM public.memberships m WHERE m.workspace_id=w.id AND m.user_id=public.current_actor()))))
$$;
REVOKE ALL ON FUNCTION workspace_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace_access(uuid) TO planner_app;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assumption_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON workspaces FOR SELECT USING(workspace_access(id));
CREATE POLICY workspace_insert ON workspaces FOR INSERT WITH CHECK(created_by=current_actor());
CREATE POLICY workspace_update ON workspaces FOR UPDATE USING(id=current_workspace() AND workspace_access(id)) WITH CHECK(id=current_workspace() AND workspace_access(id));
CREATE POLICY membership_read ON memberships FOR SELECT USING(workspace_access(workspace_id));
CREATE POLICY membership_write ON memberships FOR ALL USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
-- The first owner is inserted through a narrowly scoped function in the same creation transaction.
CREATE FUNCTION bootstrap_owner(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=target AND kind='company' AND created_by=public.current_actor()) OR EXISTS(SELECT 1 FROM public.memberships WHERE workspace_id=target) THEN
   RAISE EXCEPTION 'Invalid owner bootstrap';
 END IF;
 INSERT INTO public.memberships(workspace_id,user_id,role) VALUES(target,public.current_actor(),'OWNER');
END $$;
REVOKE ALL ON FUNCTION bootstrap_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_owner(uuid) TO planner_app;
CREATE POLICY draft_access ON planning_drafts FOR ALL USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
CREATE POLICY version_read ON assumption_versions FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id));
CREATE POLICY version_insert ON assumption_versions FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
CREATE POLICY audit_read ON audit_events FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id));
CREATE POLICY audit_insert ON audit_events FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id) AND actor_id=current_actor());
CREATE FUNCTION deny_immutable_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_VERSION'; END $$;
CREATE TRIGGER immutable_assumptions BEFORE UPDATE OR DELETE ON assumption_versions FOR EACH ROW EXECUTE FUNCTION deny_immutable_change();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_immutable_change();

GRANT USAGE ON SCHEMA public TO planner_app;
GRANT SELECT,INSERT ON users TO planner_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON sessions TO planner_app;
GRANT SELECT,INSERT,UPDATE ON workspaces TO planner_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON memberships TO planner_app;
GRANT SELECT,INSERT,UPDATE ON planning_drafts TO planner_app;
GRANT SELECT,INSERT ON assumption_versions,audit_events TO planner_app;
