import { CircleLockService } from './circle-lock.js';
import { z } from 'zod';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminOnly, RequestUser, VerifiedPCMOnly } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CircleService } from './circle.service.js';
import { blockSchema, leaveSchema, meetupSchema, meetupUpdateSchema, messageQuerySchema, postMessageSchema, readMessageSchema, reportSchema } from './circle.schemas.js';
type AuthRequest = FastifyRequest & { user: RequestUser };

@Controller('travel-circles/current') @VerifiedPCMOnly()
export class CircleController {
  constructor(private readonly circles: CircleService, private readonly locks: CircleLockService) {}
  @Get() current(@Req() req: AuthRequest) { return this.circles.current(req.user.id); }
  @Get('lock') lockStatus(@Req() req: AuthRequest, @Res({ passthrough: true }) reply: FastifyReply) { reply.header('Cache-Control', 'private, no-store, max-age=0'); return this.locks.status(req.user.id); }
  @Post('lock/approval') lockApproval(@Req() req: AuthRequest, @Body(new ZodPipe(z.object({ snapshot: z.string().regex(/^[a-f0-9]{64}$/), approve: z.boolean() }).strict())) body: { snapshot: string; approve: boolean }) { return this.locks.approve(req.user.id, body); }
  @Get('members') members(@Req() req: AuthRequest) { return this.circles.members(req.user.id); }
  @Post('confirm') confirm(@Req() req: AuthRequest) { return this.circles.confirmTravel(req.user.id); }
  @Post('leave') leave(@Req() req: AuthRequest, @Body(new ZodPipe(leaveSchema)) _body: unknown) { return this.circles.leave(req.user.id); }
  @Get('messages') messages(@Req() req: AuthRequest, @Query(new ZodPipe(messageQuerySchema)) query: any) { return this.circles.messages(req.user.id, query); }
  @Post('messages') postMessage(@Req() req: AuthRequest, @Body(new ZodPipe(postMessageSchema)) body: any) { return this.circles.postMessage(req.user.id, body.body); }
  @Delete('messages/:id') deleteMessage(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.circles.deleteMessage(req.user.id, id); }
  @Post('messages/read') markRead(@Req() req: AuthRequest, @Body(new ZodPipe(readMessageSchema)) body: any) { return this.circles.markRead(req.user.id, body.messageId); }
  @Get('meetup') meetup(@Req() req: AuthRequest) { return this.circles.currentMeetup(req.user.id); }
  @Post('meetup') propose(@Req() req: AuthRequest, @Body(new ZodPipe(meetupSchema)) body: any) { return this.circles.proposeMeetup(req.user.id, body); }
  @Patch('meetup/:id') updateMeetup(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(meetupUpdateSchema)) body: any) { return this.circles.updateMeetup(req.user.id, id, body); }
  @Post('meetup/:id/confirm') confirmMeetup(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.circles.confirmMeetup(req.user.id, id); }
  @Post('meetup/:id/cancel') cancelMeetup(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.circles.cancelMeetup(req.user.id, id); }
  @Post('reports') report(@Req() req: AuthRequest, @Body(new ZodPipe(reportSchema)) body: any) { return this.circles.report(req.user.id, body); }
  @Post('blocks') block(@Req() req: AuthRequest, @Body(new ZodPipe(blockSchema)) body: any) { return this.circles.block(req.user.id, body.userId); }
  @Get('notifications') notifications(@Req() req: AuthRequest) { return this.circles.notifications(req.user.id); }
  @Post('notifications/:id/read') readNotification(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.circles.readNotification(req.user.id, id); }
}

@Controller('admin/circles') @AdminOnly()
export class CircleAdminController { constructor(private readonly circles: CircleService) {} @Get('metrics') metrics() { return this.circles.metrics(); } }
