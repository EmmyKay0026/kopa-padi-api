import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { RequestUser, RequiresCapability } from "../common/auth.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  blockSchema,
  caseUpdateSchema,
  noteSchema,
  reportSchema,
  restrictionSchema,
  triageSchema,
} from "./safety.schemas.js";
import { SafetyService } from "./safety.service.js";
type R = FastifyRequest & { user: RequestUser };

@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}
  @Get("blocks") blocks(@Req() r: R) {
    return this.safety.blocks(r.user.id);
  }
  @Post("blocks") block(@Req() r: R, @Body(new ZodPipe(blockSchema)) b: any) {
    return this.safety.block(r.user.id, b);
  }
  @Delete("blocks/:userId") unblock(
    @Req() r: R,
    @Param("userId", ParseUUIDPipe) id: string,
  ) {
    return this.safety.unblock(r.user.id, id);
  }
  @Post("safety-reports") report(
    @Req() r: R,
    @Body(new ZodPipe(reportSchema)) b: any,
  ) {
    return this.safety.submit(r.user.id, b);
  }
  @Get("safety-reports/mine") mine(@Req() r: R) {
    return this.safety.mine(r.user.id);
  }
  @Get("safety-reports/:id/status") status(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.safety.mineStatus(r.user.id, id);
  }
}

@Controller("admin/safety")
export class SafetyAdminController {
  constructor(private readonly safety: SafetyService) {}
  @RequiresCapability("safety_reports.read") @Get("dashboard") metrics() {
    return this.safety.metrics();
  }
  @RequiresCapability("safety_reports.read") @Get("reports") reports(
    @Query() q: any,
  ) {
    return this.safety.reports(q);
  }
  @RequiresCapability("messages.review_for_safety")
  @Get("reports/:id/message-evidence")
  message(@Req() r: R, @Param("id", ParseUUIDPipe) id: string) {
    return this.safety.messageEvidence(r.user.id, id);
  }
  @RequiresCapability("safety_reports.read") @Get("reports/:id") report(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.safety.reportDetail(r.user.id, id);
  }
  @RequiresCapability("safety_reports.triage")
  @Post("reports/:id/triage")
  triage(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(triageSchema)) b: any,
  ) {
    return this.safety.triage(r.user.id, id, b);
  }
  @RequiresCapability("moderation_cases.read") @Get("cases") cases() {
    return this.safety.cases();
  }
  @RequiresCapability("moderation_cases.read") @Get("cases/:id") case(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.safety.caseDetail(id);
  }
  @RequiresCapability("moderation_cases.manage") @Patch("cases/:id") update(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(caseUpdateSchema)) b: any,
  ) {
    return this.safety.updateCase(r.user.id, id, b);
  }
  @RequiresCapability("moderation_cases.manage") @Post("cases/:id/notes") note(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(noteSchema)) b: any,
  ) {
    return this.safety.note(r.user.id, id, b);
  }
  @RequiresCapability("account_restrictions.apply")
  @Post("users/:id/restrictions")
  restrict(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(restrictionSchema)) b: any,
  ) {
    return this.safety.restrict(r.user.id, id, b);
  }
  @RequiresCapability("account_restrictions.revoke")
  @Post("users/:id/restrictions/:restrictionId/revoke")
  revoke(
    @Req() r: R,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("restrictionId", ParseUUIDPipe) rid: string,
  ) {
    return this.safety.revoke(r.user.id, id, rid);
  }
  @RequiresCapability("audit_logs.read") @Get("audit-logs") audit() {
    return this.safety.auditLogs();
  }
}
