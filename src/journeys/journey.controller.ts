import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminOnly, Public, RequestUser, SafetyOnlyAccess, VerifiedPCMOnly } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { arriveSchema, cancelSchema, checkInSchema, checklistSchema, contactSchema, locationSchema, prepareSchema, shareSchema } from './journey.schemas.js';
import { JourneyService } from './journey.service.js';
type AuthRequest = FastifyRequest & { user: RequestUser };

@Controller('journeys') @VerifiedPCMOnly()
export class JourneyController {
  constructor(private readonly journeys: JourneyService) {}
  @Post('prepare') prepare(@Req() req: AuthRequest, @Body(new ZodPipe(prepareSchema)) body: any) { return this.journeys.prepare(req.user.id, body.expectedArrivalAt); }
  @SafetyOnlyAccess() @Get('current') current(@Req() req: AuthRequest) { return this.journeys.current(req.user.id); }
  @Patch('current/checklist/:itemKey') checklist(@Req() req: AuthRequest, @Param('itemKey') key: string, @Body(new ZodPipe(checklistSchema)) body: any) { return this.journeys.checklist(req.user.id, key, body.completed); }
  @Post('current/ready') ready(@Req() req: AuthRequest) { return this.journeys.ready(req.user.id); }
  @Post('current/start') start(@Req() req: AuthRequest) { return this.journeys.start(req.user.id); }
  @SafetyOnlyAccess() @Post('current/check-ins') checkIn(@Req() req: AuthRequest, @Body(new ZodPipe(checkInSchema)) body: any) { return this.journeys.checkIn(req.user.id, body); }
  @SafetyOnlyAccess() @Post('current/arrive') arrive(@Req() req: AuthRequest, @Body(new ZodPipe(arriveSchema)) body: any) { return this.journeys.arrive(req.user.id, body.clientRequestId); }
  @SafetyOnlyAccess() @Post('current/complete') complete(@Req() req: AuthRequest) { return this.journeys.complete(req.user.id); }
  @Post('current/cancel') cancel(@Req() req: AuthRequest, @Body(new ZodPipe(cancelSchema)) body: any) { return this.journeys.cancel(req.user.id, body.reason); }
  @Post('current/share') share(@Req() req: AuthRequest, @Body(new ZodPipe(shareSchema)) body: any) { return this.journeys.createShare(req.user.id, body.trustedContactId); }
  @Post('current/share/revoke') revoke(@Req() req: AuthRequest) { return this.journeys.revokeShares(req.user.id); }
  @SafetyOnlyAccess() @Post('current/emergency/location') location(@Req() req: AuthRequest, @Body(new ZodPipe(locationSchema)) body: any) { return this.journeys.shareLocation(req.user.id, body); }
  @SafetyOnlyAccess() @Post('current/emergency/alert-trusted') alertTrusted(@Req() req: AuthRequest) { return this.journeys.alertTrusted(req.user.id); }
  @Post('current/emergency/alert-circle') alertCircle(@Req() req: AuthRequest) { return this.journeys.alertCircle(req.user.id); }
  @Post('current/separate') separate(@Req() req: AuthRequest) { return this.journeys.separateFromCircle(req.user.id); }
}

@Controller('trusted-contacts') @VerifiedPCMOnly()
export class TrustedContactController {
  constructor(private readonly journeys: JourneyService) {}
  @Get() list(@Req() req: AuthRequest) { return this.journeys.contacts(req.user.id); }
  @Post() create(@Req() req: AuthRequest, @Body(new ZodPipe(contactSchema)) body: any) { return this.journeys.createContact(req.user.id, body); }
  @Patch(':id') update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(contactSchema)) body: any) { return this.journeys.updateContact(req.user.id, id, body); }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.journeys.deleteContact(req.user.id, id); }
}

@Controller('journey-share') @Public()
export class JourneyShareController { constructor(private readonly journeys: JourneyService) {} @Get(':token') view(@Param('token') token: string) { return this.journeys.publicShare(token); } }
@Controller('admin/journeys') @AdminOnly()
export class JourneyAdminController { constructor(private readonly journeys: JourneyService) {} @Get('metrics') metrics() { return this.journeys.metrics(); } }
