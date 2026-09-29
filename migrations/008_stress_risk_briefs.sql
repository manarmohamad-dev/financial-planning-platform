CREATE TABLE risk_policy_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),revision integer NOT NULL,title text NOT NULL,configuration jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,revision)
);
CREATE TABLE stress_definitions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),parent_id uuid,revision integer NOT NULL,document jsonb NOT NULL,source_snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,parent_id),
 FOREIGN KEY(workspace_id,parent_id) REFERENCES stress_definitions(workspace_id,id)
);
CREATE TABLE stress_batches (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),policy_id uuid NOT NULL,title text NOT NULL,idempotency_key text NOT NULL,request jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key),
 FOREIGN KEY(workspace_id,policy_id) REFERENCES risk_policy_versions(workspace_id,id)
);
CREATE TABLE stress_children (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,batch_id uuid NOT NULL,definition_id uuid NOT NULL,ordinal integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed','cancelled')),attempt integer NOT NULL DEFAULT 0,started_at timestamptz,error_code text,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,batch_id,definition_id),FOREIGN KEY(workspace_id,batch_id) REFERENCES stress_batches(workspace_id,id),FOREIGN KEY(workspace_id,definition_id) REFERENCES stress_definitions(workspace_id,id)
);
CREATE TABLE stress_attempts (
 workspace_id uuid NOT NULL,child_id uuid NOT NULL,attempt integer NOT NULL,outcome text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,child_id,attempt),FOREIGN KEY(workspace_id,child_id) REFERENCES stress_children(workspace_id,id)
);
CREATE TABLE stress_results (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,child_id uuid NOT NULL,definition_id uuid NOT NULL,policy_id uuid NOT NULL,result jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,child_id),
 FOREIGN KEY(workspace_id,child_id) REFERENCES stress_children(workspace_id,id),FOREIGN KEY(workspace_id,definition_id) REFERENCES stress_definitions(workspace_id,id),FOREIGN KEY(workspace_id,policy_id) REFERENCES risk_policy_versions(workspace_id,id)
);
CREATE TABLE stress_cancellations (
 workspace_id uuid NOT NULL,batch_id uuid NOT NULL,cancelled_by uuid NOT NULL REFERENCES users(id),cancelled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,batch_id),FOREIGN KEY(workspace_id,batch_id) REFERENCES stress_batches(workspace_id,id)
);
CREATE TABLE stress_comparisons (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),idempotency_key text NOT NULL,request jsonb NOT NULL,document jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,idempotency_key)
);
CREATE TABLE decision_briefs (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,comparison_id uuid NOT NULL,document jsonb NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,comparison_id),FOREIGN KEY(workspace_id,comparison_id) REFERENCES stress_comparisons(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['risk_policy_versions','stress_definitions','stress_batches','stress_children','stress_attempts','stress_results','stress_cancellations','stress_comparisons','decision_briefs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'stress_children' THEN EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t); END IF;
 END LOOP;
END $$;
CREATE POLICY child_update ON stress_children FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE(status,attempt,started_at,error_code) ON stress_children TO planner_app;
