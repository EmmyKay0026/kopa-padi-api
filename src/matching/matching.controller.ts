import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminOnly, RequestUser, VerifiedPCMOnly } from '../common/auth.guard.js';
import { MatchingService } from './matching.service.js';
type AuthRequest=FastifyRequest&{user:RequestUser};
@Controller() @VerifiedPCMOnly()
export class MatchingController {
  constructor(private readonly matching:MatchingService){}
  @Get('matching/status') status(@Req()req:AuthRequest){return this.matching.status(req.user.id)}
  @Get('match-offers') offers(@Req()req:AuthRequest){return this.matching.offers(req.user.id)}
  @Get('match-offers/:id') offer(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string){return this.matching.offer(req.user.id,id)}
  @Post('match-offers/:id/accept') accept(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string){return this.matching.accept(req.user.id,id)}
  @Post('match-offers/:id/decline') decline(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string){return this.matching.decline(req.user.id,id)}
}
@Controller('admin/matching') @AdminOnly()
export class MatchingAdminController {
  constructor(private readonly matching:MatchingService){}
  @Get('metrics') metrics(){return this.matching.metrics()}
}
