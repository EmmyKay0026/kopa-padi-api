import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { AdminOnly, Public, type RequestUser } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { stateGuideWriteSchema, type StateGuideInput } from './state-guide.schemas.js';
import { StateGuideService } from './state-guide.service.js';

@Controller('state-guides')
export class StateGuideController {
  constructor(private readonly guides: StateGuideService) {}
  @Public()
  @Get(':stateId') read(@Param('stateId') stateId: string) { return this.guides.read(stateId, true); }
}

@Controller('admin/state-guides')
@AdminOnly()
export class StateGuideAdminController {
  constructor(private readonly guides: StateGuideService) {}
  @Get() list() { return this.guides.list(); }
  @Get(':stateId') read(@Param('stateId') stateId: string) { return this.guides.read(stateId); }
  @Put(':stateId') save(@Param('stateId') stateId: string, @Req() req: { user: RequestUser }, @Body(new ZodPipe(stateGuideWriteSchema)) body: StateGuideInput) {
    return this.guides.save(stateId, body, req.user.id);
  }
}
