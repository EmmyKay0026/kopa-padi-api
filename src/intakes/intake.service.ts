import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import { auditLogs, nyscIntakes } from '../db/schema.js';
import { activeIntake, INTAKE_CHANGED, INTAKE_LOCK } from './intake.domain.js';
import type { z } from 'zod';
import type { createIntakeSchema } from './intake.schemas.js';

@Injectable()
export class IntakeService {
  active() { return activeIntake(); }

  list() {
    return db.select().from(nyscIntakes).orderBy(desc(nyscIntakes.serviceYear), asc(nyscIntakes.batch), asc(nyscIntakes.stream));
  }

  async create(actorId: string, input: z.infer<typeof createIntakeSchema>) {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx.insert(nyscIntakes).values({ ...input, status: 'UPCOMING' }).returning();
        await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'NYSC_INTAKE_CREATED', resourceType: 'NYSC_INTAKE', resourceId: row.id, metadata: input });
        return row;
      });
    } catch (error: any) {
      if (error?.code === '23505' || error?.cause?.code === '23505') throw new ConflictException('This service year, batch and stream already exist.');
      throw error;
    }
  }

  async activate(actorId: string, id: string, expectedActiveId: string | null) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${INTAKE_LOCK}))`);
      const [target] = await tx.select().from(nyscIntakes).where(eq(nyscIntakes.id, id)).limit(1);
      if (!target) throw new NotFoundException('NYSC intake not found.');
      const current = await activeIntake(tx);
      if (current?.id === id) return current;
      if ((current?.id ?? null) !== expectedActiveId) throw new ConflictException(INTAKE_CHANGED);
      const now = new Date();
      await tx.update(nyscIntakes).set({ status: 'COMPLETED', updatedAt: now }).where(and(eq(nyscIntakes.status, 'ACTIVE'), ne(nyscIntakes.id, id)));
      const [updated] = await tx.update(nyscIntakes).set({ status: 'ACTIVE', updatedAt: now }).where(eq(nyscIntakes.id, id)).returning();
      await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'NYSC_INTAKE_ACTIVATED', resourceType: 'NYSC_INTAKE', resourceId: id, metadata: { previousActiveId: current?.id ?? null, serviceYear: updated.serviceYear, batch: updated.batch, stream: updated.stream } });
      return updated;
    });
  }

  async close(actorId: string, id: string, expectedActiveId: string | null) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${INTAKE_LOCK}))`);
      const current = await activeIntake(tx);
      if (!current || current.id !== id || expectedActiveId !== current.id) throw new ConflictException(INTAKE_CHANGED);
      const [updated] = await tx.update(nyscIntakes).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(nyscIntakes.id, id)).returning();
      await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'NYSC_INTAKE_CLOSED', resourceType: 'NYSC_INTAKE', resourceId: id, metadata: { serviceYear: current.serviceYear, batch: current.batch, stream: current.stream } });
      return updated;
    });
  }
}
