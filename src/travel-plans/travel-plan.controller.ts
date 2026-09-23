import { Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Req } from '@nestjs/common'; import type { FastifyRequest } from 'fastify'; import { RequestUser,VerifiedPCMOnly } from '../common/auth.guard.js'; import { ZodPipe } from '../common/zod.pipe.js'; import { cancellationSchema,travelPlanInputSchema } from './travel-plan.schemas.js'; import { TravelPlanService } from './travel-plan.service.js';
type AuthRequest=FastifyRequest&{user:RequestUser};
@Controller('travel-plans') @VerifiedPCMOnly()
export class TravelPlanController {constructor(private readonly plans:TravelPlanService){}
  @Post()create(@Req()req:AuthRequest,@Body(new ZodPipe(travelPlanInputSchema))body:any){return this.plans.create(req.user.id,body)}
  @Get('active')active(@Req()req:AuthRequest){return this.plans.active(req.user.id)}
  @Get()history(@Req()req:AuthRequest){return this.plans.history(req.user.id)}
  @Get(':id')detail(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string){return this.plans.ownedDetail(req.user.id,id)}
  @Patch(':id')update(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string,@Body(new ZodPipe(travelPlanInputSchema))body:any){return this.plans.update(req.user.id,id,body)}
  @Post(':id/cancel')cancel(@Req()req:AuthRequest,@Param('id',ParseUUIDPipe)id:string,@Body(new ZodPipe(cancellationSchema))body:any){return this.plans.cancel(req.user.id,id,body.reason)}
}
