import { databaseOptions } from './src/config/database-options.js';
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({
  path: "./.env",
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseOptions().connectionString!, ssl: databaseOptions().ssl },
  strict: true,
  verbose: false,
});
