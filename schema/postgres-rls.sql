-- Isolating tenants with row level security. An example, not a requirement: the package holds no opinion
-- about tenancy, and a deployment serving one organisation needs none of this.
--
-- Apply schema/postgres.sql first. The store never writes org_id, so the column carries a default taken
-- from the connection, and the policies decide what each connection may see.

ALTER TABLE tlg_incidents ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT current_setting('app.org_id', true)::uuid;
CREATE INDEX IF NOT EXISTS tlg_incidents_org ON tlg_incidents(org_id);

ALTER TABLE tlg_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_incident_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_step_involvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_step_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tlg_node_layouts ENABLE ROW LEVEL SECURITY;

-- The incident is the only table that carries the tenant. Everything else reaches it by its incident,
-- so one rule is enforced in one place and a new child table cannot forget it.
CREATE POLICY tlg_incidents_tenant ON tlg_incidents
    USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tlg_nodes_tenant ON tlg_nodes
    USING (EXISTS (SELECT 1 FROM tlg_incidents WHERE tlg_incidents.id = tlg_nodes.incident_id));

CREATE POLICY tlg_steps_tenant ON tlg_steps
    USING (EXISTS (SELECT 1 FROM tlg_incidents WHERE tlg_incidents.id = tlg_steps.incident_id));

CREATE POLICY tlg_links_tenant ON tlg_links
    USING (EXISTS (SELECT 1 FROM tlg_incidents WHERE tlg_incidents.id = tlg_links.incident_id));

CREATE POLICY tlg_classifications_tenant ON tlg_incident_classifications
    USING (EXISTS (SELECT 1 FROM tlg_incidents WHERE tlg_incidents.id = tlg_incident_classifications.incident_id));

CREATE POLICY tlg_involvements_tenant ON tlg_step_involvements
    USING (EXISTS (SELECT 1 FROM tlg_steps WHERE tlg_steps.id = tlg_step_involvements.step_id));

CREATE POLICY tlg_tags_tenant ON tlg_step_tags
    USING (EXISTS (SELECT 1 FROM tlg_steps WHERE tlg_steps.id = tlg_step_tags.step_id));

CREATE POLICY tlg_layouts_tenant ON tlg_node_layouts
    USING (EXISTS (SELECT 1 FROM tlg_nodes WHERE tlg_nodes.id = tlg_node_layouts.node_id));

-- Set once per connection, before any query:
--   SELECT set_config('app.org_id', $1, true);
-- A driver that pools connections must set it on every checkout, and the role running the queries must
-- not be the table owner or a superuser, since neither is subject to row level security.
