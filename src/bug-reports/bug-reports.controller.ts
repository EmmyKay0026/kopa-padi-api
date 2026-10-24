import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminOnly, Public, type RequestUser } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { bugReportSchema, bugStatusSchema, testModeEnabled } from './bug-reports.schemas.js';
import { BugReportsService } from './bug-reports.service.js';
@Controller()
export class BugReportsController {
  constructor(private readonly reports: BugReportsService) {}
  @Public() @Get('test-mode')
  config(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    return { enabled: testModeEnabled() };
  }
  @Post('bug-reports')
  create(@Req() request: FastifyRequest & { user: RequestUser }, @Body(new ZodPipe(bugReportSchema)) body: { title: string; description: string }) {
    if (!testModeEnabled()) throw new NotFoundException('Bug reporting is unavailable');
    return this.reports.create(request.user.id, body);
  }
  @AdminOnly() @Get('admin/bug-reports')
  list(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    return this.reports.list();
  }
  @AdminOnly() @Patch('admin/bug-reports/:id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodPipe(bugStatusSchema)) body: { status: 'OPEN' | 'RESOLVED' }) {
    return this.reports.update(id, body.status);
  }
}
