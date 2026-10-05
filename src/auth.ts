import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import "./config/environment.js";
import { validateEnvironment } from "./config/runtime.js";
import { db } from "./db/database.js";
import * as schema from "./db/schema.js";
import { queueEmail } from "./email/email.service.js";
validateEnvironment();

function verificationUrlForFrontend(url: string) {
  const verificationUrl = new URL(url);
  const requestedDestination =
    verificationUrl.searchParams.get("callbackURL") ?? "/verification";
  const destination =
    requestedDestination.startsWith("/") &&
    !requestedDestination.startsWith("//")
      ? requestedDestination
      : "/verification";
  const loginUrl = new URL(
    "/login",
    process.env.WEB_URL ?? "http://localhost:3000",
  );
  loginUrl.searchParams.set("verified", "true");
  loginUrl.searchParams.set("next", destination);
  verificationUrl.searchParams.set("callbackURL", loginUrl.toString());
  return verificationUrl.toString();
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.authVerifications,
    },
  }),
  user: {
    additionalFields: {
      accountStatus: {
        type: ["ACTIVE", "RESTRICTED", "SUSPENDED", "CLOSED"],
        required: false,
        defaultValue: "ACTIVE",
        input: false,
      },
      role: {
        type: ["USER", "ADMIN"],
        required: false,
        defaultValue: "USER",
        input: false,
      },
      lastActiveAt: { type: "date", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      queueEmail({
        userId: user.id,
        to: user.email,
        intent: "PASSWORD_RESET",
        subject: "Reset your Kopa Padi password",
        text: `Reset your password: ${url}`,
      }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) =>
      queueEmail({
        userId: user.id,
        to: user.email,
        intent: "ACCOUNT_VERIFICATION",
        subject: "Verify your Kopa Padi email",
        text: `Verify your email: ${verificationUrlForFrontend(url)}`,
      }),
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    database: { generateId: () => crypto.randomUUID() },
  },
});
