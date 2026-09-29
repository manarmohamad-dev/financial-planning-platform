CREATE TABLE import_files (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),name text NOT NULL,file_type text NOT NULL,file_hash text NOT NULL,
 original bytea NOT NULL,raw jsonb,status text NOT NULL CHECK(status IN ('parsed','failed','cancelled')),parse_error text,
 uploaded_by uuid NOT NULL REFERENCES users(id),uploaded_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id)
);
CREATE TABLE import_mapping_drafts (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,import_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,mapping jsonb NOT NULL,
 updated_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,import_id),
 FOREIGN KEY(workspace_id,import_id) REFERENCES import_files(workspace_id,id)
);
CREATE TABLE import_mapping_versions (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,import_id uuid NOT NULL,draft_id uuid NOT NULL,draft_revision integer NOT NULL,mapping jsonb NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),confirmed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,id,import_id),UNIQUE(workspace_id,draft_id,draft_revision),
 FOREIGN KEY(workspace_id,draft_id,import_id) REFERENCES import_mapping_drafts(workspace_id,id,import_id)
);
CREATE TABLE import_datasets (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,import_id uuid NOT NULL,mapping_version_id uuid NOT NULL,planning_version_id uuid NOT NULL,
 normalized_document jsonb NOT NULL,lineage jsonb NOT NULL,validation jsonb NOT NULL,accepted_warnings jsonb NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),confirmed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,mapping_version_id),
 FOREIGN KEY(workspace_id,mapping_version_id,import_id) REFERENCES import_mapping_versions(workspace_id,id,import_id),
 FOREIGN KEY(workspace_id,planning_version_id) REFERENCES planning_versions(workspace_id,id)
);
CREATE TABLE import_mapping_templates (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,name text NOT NULL,version integer NOT NULL,mapping_version_id uuid NOT NULL,fingerprint text NOT NULL,mapping jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,name,version),
 FOREIGN KEY(workspace_id,mapping_version_id) REFERENCES import_mapping_versions(workspace_id,id)
);
CREATE TABLE import_cancellations (
 workspace_id uuid NOT NULL,import_id uuid NOT NULL,cancelled_by uuid NOT NULL REFERENCES users(id),cancelled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,import_id),FOREIGN KEY(workspace_id,import_id) REFERENCES import_files(workspace_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['import_files','import_mapping_drafts','import_mapping_versions','import_datasets','import_mapping_templates','import_cancellations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT USING(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO planner_app',t);
  IF t<>'import_mapping_drafts' THEN EXECUTE format('CREATE TRIGGER immutable_content BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_immutable_change()',t); END IF;
 END LOOP;
END $$;
CREATE POLICY draft_update ON import_mapping_drafts FOR UPDATE USING(workspace_id=current_workspace() AND workspace_access(workspace_id)) WITH CHECK(workspace_id=current_workspace() AND workspace_access(workspace_id));
GRANT UPDATE ON import_mapping_drafts TO planner_app;
CREATE INDEX import_files_recent ON import_files(workspace_id,uploaded_at DESC);
CREATE INDEX import_datasets_recent ON import_datasets(workspace_id,confirmed_at DESC);
