ALTER TABLE planning_entries ADD COLUMN forecast_ref jsonb;
CREATE TABLE forecast_jobs (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), actor_id uuid NOT NULL REFERENCES users(id),
 idempotency_key text NOT NULL, request jsonb NOT NULL, history jsonb NOT NULL, eligibility jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed')), attempt integer NOT NULL DEFAULT 0,
 started_at timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,idempotency_key)
);
CREATE TABLE forecast_attempts (
 workspace_id uuid NOT NULL, job_id uuid NOT NULL, attempt integer NOT NULL, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,job_id,attempt), FOREIGN KEY(workspace_id,job_id) REFERENCES forecast_jobs(workspace_id,id)
);
CREATE TABLE forecast_artifacts (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, job_id uuid NOT NULL, history jsonb NOT NULL, eligibility jsonb NOT NULL, result jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,job_id), FOREIGN KEY(workspace_id,job_id) REFERENCES forecast_jobs(workspace_id,id)
);
CREATE TABLE forecast_approvals (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, artifact_id uuid NOT NULL, approved_by uuid NOT NULL REFERENCES users(id), approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,artifact_id), FOREIGN KEY(workspace_id,artifact_id) REFERENCES forecast_artifacts(workspace_id,id)
);
CREATE TABLE forecast_compositions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, idempotency_key text NOT NULL, request jsonb NOT NULL, assignments jsonb NOT NULL,
 planning_version_id uuid NOT NULL, baseline_version_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id), UNIQUE(workspace_id,idempotency_key),
 FOREIGN KEY(workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['forecast_jobs','forecast_attempts','forecast_artifacts','forecast_approvals','forecast_compositions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'forecast_jobs' THEN EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t); END IF;
 END LOOP;
END $$;
CREATE POLICY job_update ON forecast_jobs FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE(status,attempt,started_at,error_code) ON forecast_jobs TO planner_app;
