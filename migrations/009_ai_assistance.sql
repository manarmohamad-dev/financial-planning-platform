CREATE TABLE ai_requests (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), actor_id uuid NOT NULL REFERENCES users(id),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL, source_hash text NOT NULL, source_ref jsonb NOT NULL,
 task text NOT NULL, locale text NOT NULL CHECK(locale IN ('en','ar')), depth integer NOT NULL CHECK(depth BETWEEN 0 AND 3),
 status text NOT NULL CHECK(status IN ('pending','succeeded','failed')), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,actor_id,idempotency_key)
);
CREATE TABLE ai_artifacts (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, request_id uuid NOT NULL,
 output jsonb NOT NULL, evidence jsonb NOT NULL, proposal jsonb, input_chain jsonb NOT NULL, model text NOT NULL, schema_version text NOT NULL, prompt_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), UNIQUE(workspace_id,request_id),
 FOREIGN KEY(workspace_id,request_id) REFERENCES ai_requests(workspace_id,id)
);
CREATE TABLE ai_applications (
 workspace_id uuid NOT NULL, artifact_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 draft_id uuid NOT NULL, document_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,artifact_id,actor_id),
 FOREIGN KEY(workspace_id,artifact_id) REFERENCES ai_artifacts(workspace_id,id),
 FOREIGN KEY(workspace_id,draft_id) REFERENCES scenario_drafts(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_requests','ai_artifacts','ai_applications'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'ai_requests' THEN EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t); END IF;
 END LOOP;
END $$;
CREATE POLICY request_update ON ai_requests FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE(status,error_code,finished_at) ON ai_requests TO planner_app;
