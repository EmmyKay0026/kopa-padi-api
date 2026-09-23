import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AdminOnly } from '../common/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { campSchema, compatibilityQuerySchema, coverageSchema, hubSchema, proximitySchema } from './geography.schemas.js';
import { GeographyService } from './geography.service.js';

@Controller()
export class GeographyController {
  constructor(private readonly geography: GeographyService) {}
  @Get('locations/states') states() { return this.geography.states(); }
  @Get('locations/states/:stateId/lgas') lgas(@Param('stateId') stateId: string) { return this.geography.lgas(stateId); }
  @Get('locations/lgas/:lgaId/towns') towns(@Param('lgaId') lgaId: string) { return this.geography.towns(lgaId); }
  @Get('locations/lgas/:lgaId') lga(@Param('lgaId') lgaId: string) { return this.geography.lga(lgaId); }
  @Get('orientation-camps') camps() { return this.geography.camps(); }
  @Get('orientation-camps/:id') camp(@Param('id', ParseUUIDPipe) id: string) { return this.geography.camp(id); }
  @Get('travel-hubs') hubs() { return this.geography.hubs(); }
  @Get('travel-hubs/:id') hub(@Param('id', ParseUUIDPipe) id: string) { return this.geography.hub(id); }

  @Get('admin/geography/proximities') @AdminOnly() proximities() { return this.geography.proximities(); }
  @Get('admin/geography/compatibility') @AdminOnly() compatibility(@Query(new ZodPipe(compatibilityQuerySchema)) query: any) { return this.geography.evaluate(query.lgaA, query.lgaB); }
  @Post('admin/geography/proximities') @AdminOnly() createProximity(@Body(new ZodPipe(proximitySchema)) body: any) { return this.geography.saveProximity(null, body); }
  @Patch('admin/geography/proximities/:id') @AdminOnly() updateProximity(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(proximitySchema)) body: any) { return this.geography.saveProximity(id, body); }
  @Get('admin/geography/hubs') @AdminOnly() adminHubs() { return this.geography.hubs(); }
  @Post('admin/geography/hubs') @AdminOnly() createHub(@Body(new ZodPipe(hubSchema)) body: any) { return this.geography.saveHub(null, body); }
  @Patch('admin/geography/hubs/:id') @AdminOnly() updateHub(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(hubSchema)) body: any) { return this.geography.saveHub(id, body); }
  @Post('admin/geography/hubs/:id/coverage') @AdminOnly() coverage(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(coverageSchema)) body: any) { return this.geography.saveCoverage(id, body); }
  @Post('admin/geography/camps') @AdminOnly() createCamp(@Body(new ZodPipe(campSchema)) body: any) { return this.geography.saveCamp(null, body); }
  @Patch('admin/geography/camps/:id') @AdminOnly() updateCamp(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(campSchema)) body: any) { return this.geography.saveCamp(id, body); }
}
