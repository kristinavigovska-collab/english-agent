-- Deactivate programs below Intermediate (product: Intermediate and above only).
-- Covers special-travel (elementary) and any other beginner / elementary / pre-intermediate rows.

UPDATE programs
SET is_active = false
WHERE level_id IN ('beginner', 'elementary', 'pre_intermediate')
   OR id = 'special-travel';
