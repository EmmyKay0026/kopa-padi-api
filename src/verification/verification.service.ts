import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import { auditLogs, nyscIntakes, orientationCamps, pcmProfiles, pcmVerifications, users, verificationDocuments } from '../db/schema.js';
import { assertTransition, VerificationStatus } from '../domain.js';
import { EmailService } from '../email/email.service.js';
import { PrivateStorageService } from './storage.service.js';

@Injectable()
export class VerificationService {
  constructor(private readonly storage: PrivateStorageService, private readonly email: EmailService) {}
  async profileOverview(userId: string) {
    const [[user], [profile], status] = await Promise.all([
      db.select({ name: users.name, email: users.email, accountStatus: users.accountStatus, createdAt: users.createdAt })
        .from(users).where(eq(users.id, userId)).limit(1),
      db.select({ firstName: pcmProfiles.firstName, lastNamePrivate: pcmProfiles.lastNamePrivate, displayName: pcmProfiles.displayName })
        .from(pcmProfiles).where(eq(pcmProfiles.userId, userId)).limit(1),
      this.status(userId),
    ]);
    return { user, profile: profile ?? null, ...status };
  }
  async saveProfile(userId: string, data: { firstName: string; lastNamePrivate: string; displayName: string }) {
    const [profile] = await db.insert(pcmProfiles).values({ userId, ...data }).onConflictDoUpdate({ target: pcmProfiles.userId, set: { ...data, updatedAt: new Date() } }).returning();
    return profile;
  }
  async catalog() {
    const [intakes, camps] = await Promise.all([db.select().from(nyscIntakes).where(eq(nyscIntakes.status, 'ACTIVE')), db.select().from(orientationCamps).where(eq(orientationCamps.status, 'ACTIVE'))]);
    return { intakes, camps };
  }
  async status(userId: string) {
    const [row] = await db.select({ verification: pcmVerifications, intake: nyscIntakes, camp: orientationCamps })
      .from(pcmVerifications).innerJoin(nyscIntakes, eq(pcmVerifications.nyscIntakeId, nyscIntakes.id)).innerJoin(orientationCamps, eq(pcmVerifications.orientationCampId, orientationCamps.id))
      .where(eq(pcmVerifications.userId, userId)).orderBy(desc(pcmVerifications.updatedAt)).limit(1);
    return row ?? { verification: { status: 'UNVERIFIED' } };
  }
  async submit(userId: string, input: { nyscIntakeId: string; orientationCampId: string }, file: { buffer: Buffer; filename: string }) {
    const [[profile], [intake], [camp], [current]] = await Promise.all([
      db.select().from(pcmProfiles).where(eq(pcmProfiles.userId, userId)).limit(1), db.select().from(nyscIntakes).where(and(eq(nyscIntakes.id, input.nyscIntakeId), eq(nyscIntakes.status, 'ACTIVE'))).limit(1),
      db.select().from(orientationCamps).where(and(eq(orientationCamps.id, input.orientationCampId), eq(orientationCamps.status, 'ACTIVE'))).limit(1), db.select().from(pcmVerifications).where(eq(pcmVerifications.userId, userId)).orderBy(desc(pcmVerifications.updatedAt)).limit(1),
    ]);
    if (!profile) throw new ConflictException('Complete your PCM profile first');
    if (!intake || !camp) throw new NotFoundException('Active intake or camp not found');
    const from = (current?.status ?? 'UNVERIFIED') as VerificationStatus;
    assertTransition(from, 'SUBMITTED');
    let verificationId = current?.id ?? crypto.randomUUID();
    const stored = await this.storage.store(verificationId, file.buffer, file.filename);
    try {
      const verification = await db.transaction(async (tx) => {
        let updated;
        if (current) {
          [updated] = await tx.update(pcmVerifications).set({ ...input, status: 'SUBMITTED', submittedAt: new Date(), reviewedAt: null, reviewedBy: null, rejectionReasonCode: null, userSafeReason: null, reviewNotesPrivate: null, updatedAt: new Date() }).where(and(eq(pcmVerifications.id, current.id), eq(pcmVerifications.status, 'RESUBMISSION_REQUIRED'))).returning();
          if (!updated) throw new ConflictException('Verification changed; refresh and try again');
          await tx.update(verificationDocuments).set({ status: 'SUPERSEDED' }).where(and(eq(verificationDocuments.verificationId, current.id), eq(verificationDocuments.status, 'ACTIVE')));
        } else {
          [updated] = await tx.insert(pcmVerifications).values({ id: verificationId, userId, ...input, status: 'SUBMITTED', submittedAt: new Date() }).returning();
        }
        await tx.insert(verificationDocuments).values({ verificationId, documentType: 'CALLUP_LETTER', ...stored, sizeBytes: String(stored.sizeBytes) });
        return updated;
      });
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      this.email.dispatch({ userId, to: user.email, intent: 'PCM_SUBMITTED', subject: 'PCM verification submitted', text: 'Your PCM verification was submitted and is awaiting review.' });
      return verification;
    } catch (error) { await this.storage.remove(stored.storageKey); throw error; }
  }
  async queue(status?: VerificationStatus) {
    return db.select({ verification: pcmVerifications, profile: pcmProfiles, intake: nyscIntakes, camp: orientationCamps }).from(pcmVerifications)
      .innerJoin(pcmProfiles, eq(pcmProfiles.userId, pcmVerifications.userId)).innerJoin(nyscIntakes, eq(nyscIntakes.id, pcmVerifications.nyscIntakeId)).innerJoin(orientationCamps, eq(orientationCamps.id, pcmVerifications.orientationCampId))
      .where(status ? eq(pcmVerifications.status, status) : undefined).orderBy(desc(pcmVerifications.submittedAt));
  }
  async detail(id: string) {
    const [row] = await db.select({ verification: pcmVerifications, profile: pcmProfiles, intake: nyscIntakes, camp: orientationCamps }).from(pcmVerifications)
      .innerJoin(pcmProfiles, eq(pcmProfiles.userId, pcmVerifications.userId)).innerJoin(nyscIntakes, eq(nyscIntakes.id, pcmVerifications.nyscIntakeId)).innerJoin(orientationCamps, eq(orientationCamps.id, pcmVerifications.orientationCampId)).where(eq(pcmVerifications.id, id));
    if (!row) throw new NotFoundException('Verification not found');
    const documents = await db.select({ id: verificationDocuments.id, documentType: verificationDocuments.documentType, mimeType: verificationDocuments.mimeType, uploadedAt: verificationDocuments.uploadedAt, status: verificationDocuments.status }).from(verificationDocuments).where(eq(verificationDocuments.verificationId, id));
    return { ...row, documents };
  }
  async transition(id: string, actorId: string, expected: VerificationStatus, target: VerificationStatus, data: { reasonCode?: any; userSafeReason?: string; reviewNotesPrivate?: string } = {}) {
    if (expected === target) throw new ConflictException('Expected and target status cannot match');
    assertTransition(expected, target);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(pcmVerifications).where(eq(pcmVerifications.id, id)).limit(1);
      if (!existing) throw new NotFoundException('Verification not found');
      if (existing.userId === actorId) throw new ForbiddenException('Self-review is prohibited');
      const [updated] = await tx.update(pcmVerifications).set({ status: target, reviewedBy: actorId, reviewedAt: now, verifiedAt: target === 'VERIFIED' ? now : null, rejectionReasonCode: data.reasonCode, userSafeReason: data.userSafeReason, reviewNotesPrivate: data.reviewNotesPrivate, updatedAt: now })
        .where(and(eq(pcmVerifications.id, id), eq(pcmVerifications.status, expected))).returning();
      if (!updated) throw new ConflictException('Verification changed; refresh before taking another action');
      const action = target === 'UNDER_REVIEW' ? 'STARTED_VERIFICATION_REVIEW' : target === 'VERIFIED' ? 'APPROVED_PCM_VERIFICATION' : target === 'REJECTED' ? 'REJECTED_PCM_VERIFICATION' : target === 'RESUBMISSION_REQUIRED' ? 'REQUESTED_PCM_RESUBMISSION' : 'REVOKED_PCM_VERIFICATION';
      await tx.insert(auditLogs).values({ actorUserId: actorId, action, resourceType: 'PCM_VERIFICATION', resourceId: id, metadata: { from: expected, to: target, reasonCode: data.reasonCode } });
      return updated;
    });
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    if (target === 'VERIFIED') this.email.dispatch({ userId: user.id, to: user.email, intent: 'PCM_APPROVED', subject: 'PCM verification approved', text: 'Your PCM verification was approved.' });
    if (target === 'REJECTED') this.email.dispatch({ userId: user.id, to: user.email, intent: 'PCM_REJECTED', subject: 'PCM verification decision', text: data.userSafeReason ?? 'We could not verify your submission.' });
    if (target === 'RESUBMISSION_REQUIRED') this.email.dispatch({ userId: user.id, to: user.email, intent: 'PCM_RESUBMISSION_REQUIRED', subject: 'PCM verification needs attention', text: data.userSafeReason ?? 'Please submit updated evidence.' });
    return result;
  }
  async document(id: string, documentId: string, actorId: string) {
    const [doc] = await db.select().from(verificationDocuments).where(and(eq(verificationDocuments.id, documentId), eq(verificationDocuments.verificationId, id))).limit(1);
    if (!doc) throw new NotFoundException('Document not found');
    await db.insert(auditLogs).values({ actorUserId: actorId, action: 'VIEWED_VERIFICATION_DOCUMENT', resourceType: 'VERIFICATION_DOCUMENT', resourceId: documentId, metadata: { verificationId: id } });
    return { buffer: await this.storage.load(doc.storageKey), mimeType: doc.mimeType, filename: doc.originalName };
  }
}
