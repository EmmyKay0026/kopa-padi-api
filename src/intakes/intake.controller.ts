import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { AdminOnly, type RequestUser } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { changeActiveIntakeSchema, createIntakeSchema } from './intake.schemas.js';
import { IntakeService } from './intake.service.js';
import type { z } from 'zod';

@Controller('intakes')
export class IntakeController {
  constructor(private readonly intakes: IntakeService) {}
  @Get('active') active() { return this.intakes.active(); }
}

@Controller('admin/intakes')
@AdminOnly()
export class IntakeAdminController {
  constructor(private readonly intakes: IntakeService) {}
  @Get() list() { return this.intakes.list(); }
  @Post() create(@Req() req: { user: RequestUser }, @Body(new ZodPipe(createIntakeSchema)) body: z.infer<typeof createIntakeSchema>) { return this.intakes.create(req.user.id, body); }
  @Post(':id/activate') activate(@Req() req: { user: RequestUser }, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(changeActiveIntakeSchema)) body: { expectedActiveId: string | null }) { return this.intakes.activate(req.user.id, id, body.expectedActiveId); }
  @Post(':id/close') close(@Req() req: { user: RequestUser }, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(changeActiveIntakeSchema)) body: { expectedActiveId: string | null }) { return this.intakes.close(req.user.id, id, body.expectedActiveId); }
}
