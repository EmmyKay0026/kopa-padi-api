import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// npm workspace scripts run from apps/api, while direct commands may run from
// the repository root. Resolve the first local .env that exists in either case.
const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
];
const envPath = envCandidates.find((candidate) => existsSync(candidate));

if (envPath) config({ path: envPath });
