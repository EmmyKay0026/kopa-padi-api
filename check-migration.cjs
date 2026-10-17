require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const url = new URL(process.env.DATABASE_URL);

console.log("Database host:", url.hostname);
console.log("Database name:", url.pathname.slice(1));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? true : undefined,
});

async function check() {
  const index = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'user'
    AND indexname = 'user_email_lower_unique'
  `);

  console.log("Email index:", index.rowCount ? "EXISTS" : "MISSING");

  const duplicates = await pool.query(`
    SELECT lower(email)
    FROM "user"
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  `);

  console.log("Duplicate email groups:", duplicates.rowCount);

  const migrations = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM drizzle.__drizzle_migrations
  `);

  console.log("Recorded migrations:", migrations.rows[0].total);
}

check()
  .catch((error) => {
    console.error("Verification error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
