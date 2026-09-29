CREATE TABLE scenario_drafts (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), baseline_version_id uuid NOT NULL,
 document jsonb NOT NULL, contributors jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES users(id),updated_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
CREATE TABLE scenario_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,draft_id uuid NOT NULL,draft_revision integer NOT NULL,baseline_version_id uuid NOT NULL,
 document jsonb NOT NULL,contributors jsonb NOT NULL,created_by uuid NOT NULL REFERENCES users(id),confirmed_by uuid NOT NULL REFERENCES users(id),confirmed_at timestamptz NOT NULL DEFAULT now(),contract_version text NOT NULL,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,baseline_version_id),UNIQUE(workspace_id,draft_id,draft_revision),
 FOREIGN KEY(workspace_id,draft_id) REFERENCES scenario_drafts(workspace_id,id),FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
CREATE TABLE scenario_runs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,scenario_version_id uuid NOT NULL,baseline_version_id uuid NOT NULL,
 idempotency_key text NOT NULL,input_snapshot jsonb NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,baseline_version_id),UNIQUE(workspace_id,idempotency_key),
 FOREIGN KEY(workspace_id,scenario_version_id,baseline_version_id) REFERENCES scenario_versions(workspace_id,id,baseline_version_id)
);
CREATE TABLE scenario_period_results (
 workspace_id uuid NOT NULL,run_id uuid NOT NULL,period char(7) NOT NULL,metric text NOT NULL,
 baseline numeric(24,6),scenario numeric(24,6),difference numeric(24,6),PRIMARY KEY(workspace_id,run_id,period,metric),
 FOREIGN KEY(workspace_id,run_id) REFERENCES scenario_runs(workspace_id,id)
);
CREATE TABLE scenario_comparisons (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,baseline_version_id uuid NOT NULL,title text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,baseline_version_id),FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
CREATE TABLE scenario_comparison_runs (
 workspace_id uuid NOT NULL,comparison_id uuid NOT NULL,baseline_version_id uuid NOT NULL,run_id uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 2),
 PRIMARY KEY(workspace_id,comparison_id,run_id),UNIQUE(workspace_id,comparison_id,ordinal),
 FOREIGN KEY(workspace_id,comparison_id,baseline_version_id) REFERENCES scenario_comparisons(workspace_id,id,baseline_version_id),
 FOREIGN KEY(workspace_id,run_id,baseline_version_id) REFERENCES scenario_runs(workspace_id,id,baseline_version_id)
);
CREATE INDEX scenario_drafts_recent ON scenario_drafts(workspace_id,updated_at DESC);
CREATE INDEX scenario_versions_recent ON scenario_versions(workspace_id,confirmed_at DESC);
CREATE INDEX scenario_runs_recent ON scenario_runs(workspace_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['scenario_drafts','scenario_versions','scenario_runs','scenario_period_results','scenario_comparisons','scenario_comparison_runs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'scenario_drafts' THEN EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t); END IF;
 END LOOP;
END $$;
CREATE POLICY draft_update ON scenario_drafts FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE ON scenario_drafts TO planner_app;
