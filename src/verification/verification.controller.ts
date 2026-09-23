import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { AdminOnly, Public, RequestUser, VerifiedPCMOnly } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { profileSchema, queueSchema, reviewSchema } from './verification.schemas.js';
import { VerificationService } from './verification.service.js';

type AuthRequest = FastifyRequest & { user: RequestUser; file: () => Promise<MultipartFile | undefined> };
@Controller()
export class VerificationController {
  constructor(private readonly service: VerificationService) {}
  @Get('me') me(@Req() req: AuthRequest) { return { user: req.user }; }
  @Get('me/profile') profileOverview(@Req() req: AuthRequest) { return this.service.profileOverview(req.user.id); }
  @Put('me/profile') saveProfile(@Req() req: AuthRequest, @Body(new ZodPipe(profileSchema)) body: any) { return this.service.saveProfile(req.user.id, body); }
  @Get('catalog') catalog() { return this.service.catalog(); }
  @Get('verification/status') status(@Req() req: AuthRequest) { return this.service.status(req.user.id); }
  @Post('verification')
  async submit(@Req() req: AuthRequest) {
    const file = await req.file();
    if (!file || file.fieldname !== 'document') throw new BadRequestException('A call-up document is required');
    const field = (name: string) => {
      const candidate = (file.fields as Record<string, { value?: unknown }>)[name];
      return typeof candidate?.value === 'string' ? candidate.value : '';
    };
    const input = { nyscIntakeId: field('nyscIntakeId'), orientationCampId: field('orientationCampId') };
    const parsed = await import('./verification.schemas.js').then(({ submitSchema }) => submitSchema.safeParse(input));
    if (!parsed.success) throw new BadRequestException({ message: 'Invalid intake or camp', issues: parsed.error.issues });
    return this.service.submit(req.user.id, parsed.data, { buffer: await file.toBuffer(), filename: file.filename });
  }
  @Get('verified-area') @VerifiedPCMOnly() verified() { return { message: 'Verified PCM access granted.' }; }

  @Get('admin/verifications') @AdminOnly()
  queue(@Query(new ZodPipe(queueSchema)) query: any) { return this.service.queue(query.status); }
  @Get('admin/verifications/:id') @AdminOnly()
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.detail(id); }
  @Post('admin/verifications/:id/start-review') @AdminOnly()
  start(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Body(new ZodPipe(reviewSchema)) body: any) {
    if (body.expectedStatus !== 'SUBMITTED') throw new BadRequestException('Start review requires expectedStatus SUBMITTED');
    return this.service.transition(id, req.user.id, 'SUBMITTED', 'UNDER_REVIEW');
  }
  @Post('admin/verifications/:id/approve') @AdminOnly()
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Body(new ZodPipe(reviewSchema)) body: any) {
    if (body.expectedStatus !== 'UNDER_REVIEW') throw new BadRequestException('Approval requires expectedStatus UNDER_REVIEW');
    return this.service.transition(id, req.user.id, 'UNDER_REVIEW', 'VERIFIED', body);
  }
  @Post('admin/verifications/:id/reject') @AdminOnly()
  reject(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Body(new ZodPipe(reviewSchema)) body: any) {
    if (body.expectedStatus !== 'UNDER_REVIEW' || !body.reasonCode || !body.userSafeReason) throw new BadRequestException('Rejection requires expectedStatus, reasonCode, and a user-safe reason');
    return this.service.transition(id, req.user.id, 'UNDER_REVIEW', 'REJECTED', body);
  }
  @Post('admin/verifications/:id/request-resubmission') @AdminOnly()
  resubmit(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest, @Body(new ZodPipe(reviewSchema)) body: any) {
    if (body.expectedStatus !== 'UNDER_REVIEW' || !body.reasonCode || !body.userSafeReason) throw new BadRequestException('Resubmission requires expectedStatus, reasonCode, and a user-safe reason');
    return this.service.transition(id, req.user.id, 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED', body);
  }
  @Get('admin/verifications/:id/documents/:documentId') @AdminOnly()
  async document(@Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Req() req: AuthRequest, @Res() reply: FastifyReply) {
    const doc = await this.service.document(id, documentId, req.user.id);
    return reply.header('content-type', doc.mimeType).header('content-disposition', `attachment; filename="${doc.filename.replace(/["\r\n]/g, '_')}"`).header('cache-control', 'no-store').send(doc.buffer);
  }
}
