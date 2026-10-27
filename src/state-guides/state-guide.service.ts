import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import { auditLogs, states, stateGuides, stateGuideSecretariats, stateGuideLife, stateGuideTravel, stateGuidePhotos, stateGuideExpectations, stateGuideSources } from '../db/schema.js';
import type { StateGuideInput } from './state-guide.schemas.js';

export const STATE_GUIDE_CHANGED = 'This state guide changed. Reload the latest version before saving.';

@Injectable()
export class StateGuideService {
  list() {
    return db.select({ stateId: states.id, name: states.name, isActive: states.isActive, version: stateGuides.version, updatedAt: stateGuides.updatedAt, reviewedOn: stateGuides.reviewedOn, reviewStatus: stateGuides.reviewStatus })
      .from(states).leftJoin(stateGuides, eq(stateGuides.stateId, states.id)).orderBy(asc(states.name));
  }

  async read(stateId: string, publicRead = false) {
    // A consistent snapshot prevents mixing a saved profile with older child rows.
    return db.transaction(async tx => {
      const [state] = await tx.select({ id: states.id, name: states.name, isActive: states.isActive }).from(states).where(eq(states.id, stateId));
      if (!state || (publicRead && !state.isActive)) throw new NotFoundException('State not found');
      const [guide] = await tx.select().from(stateGuides).where(eq(stateGuides.stateId, stateId));
      if (!guide) {
        if (publicRead) throw new NotFoundException('State guide not found');
        return { stateId, name: state.name, version: 0, updatedAt: null,
          information: { capital: '', geopoliticalZone: '', overview: '', spokenLanguages: '', culturalHighlights: '', localFood: '', placesToVisit: '', weatherAndClimate: '', transportOptions: '', travelSafetyNotes: '', costOfLiving: '', pcmTips: '' },
          secretariat: { address: '', phoneNumber: '', email: '', sourceUrl: 'https://www.nysc.gov.ng/secretariat.html', googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`NYSC Secretariat ${state.name}`)}` },
          research: { reviewedOn: new Date().toISOString().slice(0, 10), status: 'draft', notes: '', sourceCaveats: [], dynamicFieldsRequireRefresh: [], sources: {} }, photos: [], expectations: [] };
      }
      // A transaction owns one PostgreSQL connection; run its statements in order.
      const [secretariat] = await tx.select().from(stateGuideSecretariats).where(eq(stateGuideSecretariats.stateId, stateId));
      const [life] = await tx.select().from(stateGuideLife).where(eq(stateGuideLife.stateId, stateId));
      const [travel] = await tx.select().from(stateGuideTravel).where(eq(stateGuideTravel.stateId, stateId));
      const photos = await tx.select().from(stateGuidePhotos).where(eq(stateGuidePhotos.stateId, stateId)).orderBy(asc(stateGuidePhotos.position));
      const expectations = await tx.select().from(stateGuideExpectations).where(eq(stateGuideExpectations.stateId, stateId)).orderBy(asc(stateGuideExpectations.position));
      const sourceRows = await tx.select().from(stateGuideSources).where(eq(stateGuideSources.stateId, stateId)).orderBy(asc(stateGuideSources.category), asc(stateGuideSources.position));
      if (!secretariat || !life || !travel) throw new NotFoundException('State guide not found');
      const sources: Record<string, string[]> = Object.create(null);
      for (const source of sourceRows) (sources[source.category] ??= []).push(source.url);
      return {
        stateId, name: state.name, version: guide.version, updatedAt: guide.updatedAt,
        information: { capital: guide.capital, geopoliticalZone: guide.geopoliticalZone, overview: guide.overview,
          spokenLanguages: life.spokenLanguages, culturalHighlights: life.culturalHighlights, localFood: life.localFood, placesToVisit: life.placesToVisit,
          weatherAndClimate: travel.weatherAndClimate, transportOptions: travel.transportOptions, travelSafetyNotes: travel.travelSafetyNotes, costOfLiving: travel.costOfLiving, pcmTips: travel.pcmTips },
        secretariat: { address: secretariat.address, phoneNumber: secretariat.phoneNumber, email: secretariat.email, sourceUrl: secretariat.sourceUrl, googleMapsUrl: secretariat.googleMapsUrl },
        research: { reviewedOn: guide.reviewedOn, status: guide.reviewStatus, notes: guide.researchNotes, sourceCaveats: guide.sourceCaveats, dynamicFieldsRequireRefresh: guide.dynamicFieldsRequireRefresh, sources },
        photos: photos.map(({ src, alt, caption, illustrative }) => ({ src, alt, caption, illustrative })),
        expectations: expectations.map(({ title, description }) => ({ title, description })),
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async save(stateId: string, input: StateGuideInput, actorId: string | null) {
    return db.transaction(async tx => {
      const [state] = await tx.select({ id: states.id, name: states.name }).from(states).where(eq(states.id, stateId));
      if (!state) throw new NotFoundException('State not found');
      const { information: info, research, secretariat } = input;
      const now = new Date();
      const values = { capital: info.capital, geopoliticalZone: info.geopoliticalZone, overview: info.overview,
        reviewedOn: research.reviewedOn, reviewStatus: research.status, researchNotes: research.notes,
        sourceCaveats: research.sourceCaveats, dynamicFieldsRequireRefresh: research.dynamicFieldsRequireRefresh,
        updatedBy: actorId, updatedAt: now, version: input.version + 1 };
      const saved = input.version === 0
        ? await tx.insert(stateGuides).values({ stateId, ...values }).onConflictDoNothing({ target: stateGuides.stateId }).returning()
        : await tx.update(stateGuides).set(values).where(and(eq(stateGuides.stateId, stateId), eq(stateGuides.version, input.version))).returning();
      if (!saved.length) throw new ConflictException(STATE_GUIDE_CHANGED);
      const contactValues = { stateId, ...secretariat };
      const lifeValues = { stateId, spokenLanguages: info.spokenLanguages, culturalHighlights: info.culturalHighlights, localFood: info.localFood, placesToVisit: info.placesToVisit };
      const travelValues = { stateId, weatherAndClimate: info.weatherAndClimate, transportOptions: info.transportOptions, travelSafetyNotes: info.travelSafetyNotes, costOfLiving: info.costOfLiving, pcmTips: info.pcmTips };
      await tx.insert(stateGuideSecretariats).values(contactValues).onConflictDoUpdate({ target: stateGuideSecretariats.stateId, set: contactValues });
      await tx.insert(stateGuideLife).values(lifeValues).onConflictDoUpdate({ target: stateGuideLife.stateId, set: lifeValues });
      await tx.insert(stateGuideTravel).values(travelValues).onConflictDoUpdate({ target: stateGuideTravel.stateId, set: travelValues });
      await tx.delete(stateGuidePhotos).where(eq(stateGuidePhotos.stateId, stateId));
      await tx.delete(stateGuideExpectations).where(eq(stateGuideExpectations.stateId, stateId));
      await tx.delete(stateGuideSources).where(eq(stateGuideSources.stateId, stateId));
      if (input.photos.length) await tx.insert(stateGuidePhotos).values(input.photos.map((photo, position) => ({ ...photo, stateId, position })));
      if (input.expectations.length) await tx.insert(stateGuideExpectations).values(input.expectations.map((item, position) => ({ ...item, stateId, position })));
      const sources = Object.entries(research.sources).flatMap(([category, urls]) => [...new Set(urls)].map((url, position) => ({ stateId, category, url, position })));
      if (sources.length) await tx.insert(stateGuideSources).values(sources);
      if (actorId) await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'STATE_GUIDE_UPDATED', resourceType: 'STATE_GUIDE', resourceId: saved[0].id,
        metadata: { stateId, previousVersion: input.version, version: saved[0].version, reviewStatus: research.status, photoCount: input.photos.length, expectationCount: input.expectations.length } });
      return { ...input, stateId, name: state.name, version: saved[0].version, updatedAt: now };
    });
  }
}
