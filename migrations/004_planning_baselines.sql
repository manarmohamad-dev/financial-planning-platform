CREATE TABLE financial_drafts (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),document jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1,contributors jsonb NOT NULL DEFAULT '{}',created_by uuid NOT NULL REFERENCES users(id),updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id)
);
CREATE TABLE planning_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),draft_id uuid NOT NULL,draft_revision integer NOT NULL,
 title text NOT NULL,currency text NOT NULL CHECK(currency IN ('EGP','SAR','USD','AED')),projection_start char(7) NOT NULL,
 horizon_months integer NOT NULL CHECK(horizon_months IN (3,6,12)),requested_outputs jsonb NOT NULL,coverage jsonb NOT NULL,
 opening_available numeric(24,6),opening_restricted numeric(24,6),opening_metadata jsonb,
 contract_version text NOT NULL,confirmed_by uuid NOT NULL REFERENCES users(id),confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,draft_id,draft_revision),
 FOREIGN KEY(workspace_id,draft_id) REFERENCES financial_drafts(workspace_id,id)
);
CREATE TABLE planning_entries (
 id uuid NOT NULL,workspace_id uuid NOT NULL,planning_version_id uuid NOT NULL,ordinal integer NOT NULL,
 component_key text NOT NULL,label text NOT NULL,category text NOT NULL,effect text NOT NULL,currency text NOT NULL,
 source_kind text NOT NULL,source_note text NOT NULL,scope jsonb NOT NULL,start_period char(7) NOT NULL,end_period char(7) NOT NULL,
 event_date date,amount numeric(24,6),monthly_cost numeric(24,6),onboarding_cost numeric(24,6),
 driver jsonb NOT NULL,timing jsonb NOT NULL,committed boolean NOT NULL,opening_obligation boolean NOT NULL,settles jsonb,
 supplied_by uuid NOT NULL REFERENCES users(id),confirmed_by uuid NOT NULL REFERENCES users(id),confirmed_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,planning_version_id,id),UNIQUE(workspace_id,planning_version_id,ordinal),
 FOREIGN KEY(workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id)
);
CREATE TABLE reserve_policy_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),revision integer NOT NULL,
 minimum_cash numeric(24,6),note text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,revision)
);
CREATE TABLE baseline_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),planning_version_id uuid NOT NULL,reserve_policy_id uuid,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,reserve_policy_id) REFERENCES reserve_policy_versions(workspace_id,id)
);
CREATE TABLE baseline_publications (
 workspace_id uuid NOT NULL,baseline_version_id uuid NOT NULL,published_by uuid NOT NULL REFERENCES users(id),published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,baseline_version_id),FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
CREATE TABLE baseline_runs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,baseline_version_id uuid NOT NULL,idempotency_key text NOT NULL,
 manifest jsonb NOT NULL,capabilities jsonb NOT NULL,summary jsonb NOT NULL,engine_version text NOT NULL,rounding_policy text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key),FOREIGN KEY(workspace_id,baseline_version_id) REFERENCES baseline_versions(workspace_id,id)
);
CREATE TABLE baseline_period_results (
 workspace_id uuid NOT NULL,run_id uuid NOT NULL,period char(7) NOT NULL,revenue numeric(24,6),operating_expenses numeric(24,6),operating_result numeric(24,6),non_operating_expenses numeric(24,6),
 opening_cash numeric(24,6),cash_inflows numeric(24,6),cash_outflows numeric(24,6),net_cash_movement numeric(24,6),closing_cash numeric(24,6),restricted_cash numeric(24,6),evidence jsonb NOT NULL,
 PRIMARY KEY(workspace_id,run_id,period),FOREIGN KEY(workspace_id,run_id) REFERENCES baseline_runs(workspace_id,id)
);
CREATE TABLE baseline_movements (
 workspace_id uuid NOT NULL,run_id uuid NOT NULL,id text NOT NULL,entry_id uuid NOT NULL,period char(7) NOT NULL,
 effect text NOT NULL,amount numeric(24,6) NOT NULL,evidence jsonb NOT NULL,
 PRIMARY KEY(workspace_id,run_id,id),FOREIGN KEY(workspace_id,run_id) REFERENCES baseline_runs(workspace_id,id)
);
CREATE INDEX financial_drafts_recent ON financial_drafts(workspace_id,updated_at DESC);
CREATE INDEX planning_versions_recent ON planning_versions(workspace_id,confirmed_at DESC);
CREATE INDEX planning_entries_components ON planning_entries(workspace_id,planning_version_id,component_key,start_period);
CREATE INDEX baseline_versions_recent ON baseline_versions(workspace_id,created_at DESC);
CREATE INDEX baseline_runs_recent ON baseline_runs(workspace_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_drafts','planning_versions','planning_entries','reserve_policy_versions','baseline_versions','baseline_publications','baseline_runs','baseline_period_results','baseline_movements'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'financial_drafts' THEN
   EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t);
  END IF;
 END LOOP;
END $$;
CREATE POLICY draft_update ON financial_drafts FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE ON financial_drafts TO planner_app;
