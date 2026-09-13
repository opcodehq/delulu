-- Private beta workspaces have a lower internal inference ceiling than the paid add-on.
UPDATE agent_workspaces
SET monthly_budget_micros = 5000000
WHERE access_tier = 'beta'
  AND monthly_budget_micros = 10000000;
