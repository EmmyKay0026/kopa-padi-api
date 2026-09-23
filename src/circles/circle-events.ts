import { eq } from 'drizzle-orm';
import { circleConversations, circleMessages } from '../db/schema.js';

export async function ensureConversation(tx: any, travelCircleId: string) {
  const [created] = await tx.insert(circleConversations).values({ travelCircleId }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await tx.select().from(circleConversations).where(eq(circleConversations.travelCircleId, travelCircleId)).limit(1);
  return existing;
}

export async function circleSystemMessage(tx: any, travelCircleId: string, eventKey: string, body: string, type: 'SYSTEM' | 'SAFETY_NOTICE' = 'SYSTEM') {
  const conversation = await ensureConversation(tx, travelCircleId);
  if (!conversation) throw new Error('Unable to create Circle conversation');
  await tx.insert(circleMessages).values({ conversationId: conversation.id, type, body, eventKey, senderUserId: null }).onConflictDoNothing();
  return conversation;
}

