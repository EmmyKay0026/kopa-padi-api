-- Run against a READ-ONLY connection to the TARGET database, BEFORE applying 0010.
-- Expected result of first query: zero rows.
-- If any row is returned, STOP. Resolve collisions through an approved account process.
SELECT lower(email) AS email_normalized,
       count(*) AS account_count
FROM "user"
GROUP BY lower(email)
HAVING count(*) > 1
ORDER BY account_count DESC, email_normalized;

-- Identify pre-existing unique/expression indexes; do not assume 0010 was never
-- manually executed. An existing index may require migration-history reconciliation.
SELECT schemaname, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user'
  AND (indexname = 'user_email_lower_unique'
       OR indexdef ILIKE '%lower%email%')
ORDER BY schemaname, indexname;

-- Optional: inspect applied Drizzle migrations if that schema/table exists.
-- SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 10;
