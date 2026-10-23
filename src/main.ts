import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { fromNodeHeaders } from "better-auth/node";
import { randomUUID } from "node:crypto";
import "reflect-metadata";
import { AppModule } from "./app.module.js";
import { auth } from "./auth.js";
import {
  installFatalErrorHandlers,
  safeDiagnostic,
  SafeExceptionFilter,
  SafeLogController,
  safeNestLogger,
  withErrorContext,
} from "./common/safe-errors.js";
import "./config/environment.js";
import {
  allowedAuthRedirects,
  allowedBrowserWrite,
  trustedProxies,
} from "./config/http-security.js";
import { allowedDuringMaintenance } from "./config/maintenance.js";
import { enabled, validateEnvironment } from "./config/runtime.js";
import { pool } from "./db/database.js";

async function bootstrap() {
  installFatalErrorHandlers();
  validateEnvironment();
  const adapter = new FastifyAdapter({
    logController: new SafeLogController(),
    genReqId: () => randomUUID(),
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            level: process.env.LOG_LEVEL ?? "info",
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
            ],
          },
    trustProxy: trustedProxies(),
    bodyLimit: Number(process.env.MAX_UPLOAD_BYTES ?? 5_242_880) + 65_536,
  });
  const fastify = adapter.getInstance();
  const webOrigin = new URL(process.env.WEB_URL ?? "http://localhost:3000")
    .origin;
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (/^\/api\/(journey-share(?:\/|$)|journeys(?:\/|$))/.test(request.url)) {
      reply.header("Cache-Control", "private, no-store, max-age=0");
      reply.header("Referrer-Policy", "no-referrer");
    }
    if (
      !allowedBrowserWrite(
        request.method,
        request.headers.origin,
        request.headers["sec-fetch-site"] as string | undefined,
        webOrigin,
      )
    ) {
      return reply.code(403).send({ message: "Untrusted request origin" });
    }
  });
  fastify.addHook("preValidation", async (request, reply) => {
    if (
      request.method === "POST" &&
      request.url.startsWith("/api/auth/") &&
      !allowedAuthRedirects(request.body, [
        webOrigin,
        new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:4000").origin,
      ])
    ) {
      return reply
        .code(403)
        .send({ message: "Untrusted authentication redirect" });
    }
  });
  await fastify.register(cors, {
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await fastify.register(helmet);
  await fastify.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await fastify.register(multipart, {
    limits: {
      files: 1,
      fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 5_242_880),
      fields: 4,
    },
  });
  fastify.get("/api/health", async () => ({ status: "ok" }));
  fastify.get("/api/health/ready", async () => {
    await pool.query("select 1");
    return { status: "ready" };
  });
  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    async handler(request, reply) {
      if (
        request.method === "POST" &&
        request.url.includes("/sign-up") &&
        !enabled("REGISTRATION_ENABLED", true)
      )
        return reply.code(503).send({
          code: "PILOT_REGISTRATION_CLOSED",
          message: "Registration is temporarily unavailable.",
        });
      const origin = `${request.protocol}://${request.headers.host}`;
      const body = request.body ? JSON.stringify(request.body) : undefined;
      const response = await withErrorContext(request, () =>
        auth.handler(
          new Request(new URL(request.url, origin), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(body ? { body } : {}),
          }),
        ),
      );
      if (response.status >= 500) {
        request.log.error(
          {
            request_id: request.id,
            route: request.routeOptions.url,
            status_code: response.status,
            error_category: "authentication_error",
          },
          "request_failed",
        );
        return reply
          .code(response.status)
          .send({
            code: "INTERNAL_ERROR",
            message: "Something went wrong. Please try again.",
          });
      }
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(Buffer.from(await response.arrayBuffer()));
    },
  });
  fastify.addHook("onRequest", async (request, reply) => {
    (request as any).pilotStartedAt = process.hrtime.bigint();
    reply.header("x-request-id", request.id);
    const write = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const safety = allowedDuringMaintenance(request.url);
    if (write && enabled("MAINTENANCE_MODE", false) && !safety)
      return reply.code(503).send({
        code: "MAINTENANCE_MODE",
        message:
          "This action is temporarily unavailable. Please try again later.",
      });
  });
  fastify.addHook("onResponse", async (request, reply) => {
    const started = (request as any).pilotStartedAt as bigint | undefined;
    request.log.info(
      {
        request_id: request.id,
        route: request.routeOptions.url,
        status_code: reply.statusCode,
        duration_ms: started
          ? Number(process.hrtime.bigint() - started) / 1e6
          : undefined,
      },
      "request_completed",
    );
  });
  // Allow empty JSON bodies (e.g. POST /travel-circles/current/confirm with no payload).
  // Fastify's default parser throws FST_ERR_CTP_EMPTY_JSON_BODY when Content-Type is
  // application/json and the body is empty. Use adapter.useBodyParser so that
  // _isParserRegistered is set and Nest does not try to register a second parser.
  adapter.useBodyParser(
    "application/json",
    false,
    { bodyLimit: (fastify as any).initialConfig?.bodyLimit },
    (req: any, body: any, done: any) => {
      if (!body || (Buffer.isBuffer(body) && body.length === 0)) {
        done(null, undefined);
        return;
      }
      try {
        const str = Buffer.isBuffer(body) ? body.toString() : (body as string);
        if (str.trim() === "") {
          done(null, undefined);
          return;
        }
        done(null, JSON.parse(str));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { logger: safeNestLogger, abortOnError: false },
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  app.setGlobalPrefix("api");
  await app.listen(
    Number(process.env.PORT ?? 4000),
    process.env.HOST ?? "127.0.0.1",
  );
}
try {
  await bootstrap();
} catch (error) {
  console.error(JSON.stringify(safeDiagnostic("api_startup_failed", error)));
  process.exitCode = 1;
}
