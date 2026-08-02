-- Deactivate General English programs (product: professional/special tracks only).
-- Catalog JSON no longer seeds these ids; hide any rows already applied from 007.

UPDATE programs
SET is_active = false
WHERE category = 'general'
   OR id LIKE 'general-%';
