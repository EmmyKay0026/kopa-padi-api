/**
 * Kopa-Padi P0 / migration 0010 preparation.
 * Run from the root of the SEPARATE kopa-padi-api repository:
 *   node path/to/kopa-padi-p0-0010-prepare.mjs
 *
 * This script edits local source files only. It does NOT connect to a database,
 * run a migration, deploy, push a commit or modify the frontend repository.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const filename = (...segments) => path.join(root, ...segments);
const packagePath = filename('package.json');
const schemaPath = filename('src', 'db', 'schema.ts');
const configPath = filename('drizzle.config.ts');
const journalPath = filename('drizzle', 'meta', '_journal.json');
const brokenMigrationPath = filename('drizzle', '0010_case_insensitive_email.sql');

function stop(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}
function read(file) {
  if (!fs.existsSync(file)) stop(`Required file missing: ${file}`);
  return fs.readFileSync(file, 'utf8');
}
function checkAndBuildSchema(content) {
  if (content.includes('user_email_lower_unique')) {
    stop('Schema already mentions user_email_lower_unique. Review existing edits manually.');
  }
  const begin = content.indexOf("export const users = pgTable('user', {");
  const end = content.indexOf("export const sessions = pgTable('session', {", begin);
  if (begin < 0 || end < begin) stop('Cannot locate the expected user table followed by session table.');
  const users = content.slice(begin, end);
  if (!users.includes('email: text().notNull().unique()')) {
    stop('Existing user.email column has changed; inspect before applying this fix.');
  }
  const closingPattern = /\}\);(\r?\n)$/;
  if (!closingPattern.test(users)) stop('User table closing syntax has changed; inspect manually.');
  const closing = "}, (t) => [uniqueIndex('user_email_lower_unique').on(sql`lower(${t.email})`)])" + ';';
  const replacement = users.replace(closingPattern, `${closing}$1`);
  return content.slice(0, begin) + replacement + content.slice(end);
}

if (!fs.existsSync(packagePath)) stop('Run this command from the kopa-padi-api repository root.');
const pkg = JSON.parse(read(packagePath));
if (pkg.name !== '@kopa-padi/api') stop('The working directory is not the standalone Kopa-Padi API repository.');
const journal = JSON.parse(read(journalPath));
if (!Array.isArray(journal.entries) || journal.entries.length !== 10 || journal.entries.at(-1)?.tag !== '0009_medical_wilson_fisk') {
  stop('Migration journal differs from the inspected 0000–0009 history. Do not alter it automatically.');
}
const badSql = read(brokenMigrationPath);
const expectedSql = 'CREATE UNIQUE INDEX IF NOT EXISTS user_email_lower_unique ON "user" (lower(email));`n';
if (badSql.trim() !== expectedSql) stop('Unregistered 0010 SQL file has changed. Review it before continuing.');
const oldSchema = read(schemaPath);
const oldConfig = read(configPath);
const nextSchema = checkAndBuildSchema(oldSchema);
const oldConfigSetting = 'path: "../../.env"';
if (!oldConfig.includes(oldConfigSetting)) {
  stop('Expected monorepo .env path was not found; inspect drizzle.config.ts manually.');
}
const nextConfig = oldConfig.replace(oldConfigSetting, 'path: "./.env"');

const backups = filename('.p0-0010-backup');
if (fs.existsSync(backups)) stop('Backup directory already exists. Review or rename it before rerunning.');
fs.mkdirSync(backups);
fs.writeFileSync(path.join(backups, 'schema.ts.before'), oldSchema);
fs.writeFileSync(path.join(backups, 'drizzle.config.ts.before'), oldConfig);
fs.renameSync(brokenMigrationPath, path.join(backups, '0010_case_insensitive_email.sql.invalid'));
fs.writeFileSync(schemaPath, nextSchema);
fs.writeFileSync(configPath, nextConfig);

console.log('Prepared schema and Drizzle configuration for standalone backend repo.');
console.log('Moved malformed unregistered 0010 SQL into .p0-0010-backup/');
console.log('No database connection, migration, npm install, deployment, or Git push occurred.');
console.log('NEXT: run `npm run db:generate -- --name=case_insensitive_email` from THIS backend directory.');
console.log('Review the generated 0010 SQL, journal, and snapshot before running any migration.');
