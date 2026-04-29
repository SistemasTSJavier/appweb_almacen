-- Align collaborator_profiles/collaborator_history employee_id with employees.id
-- using employee_code as matching key.

update public.collaborator_profiles cp
set employee_id = e.id::text
from public.employees e
where e.employee_code = cp.employee_code
  and cp.employee_id <> e.id::text;
