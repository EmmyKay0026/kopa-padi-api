import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import { bugReports } from '../db/schema.js';
@Injectable()
export class BugReportsService {
  async create(reporterUserId: string, body: { title: string; description: string }) {
    const [row] = await db.insert(bugReports).values({ ...body, reporterUserId }).returning({ id: bugReports.id });
    return row;
  }
  async list() {
    return db.select().from(bugReports).orderBy(desc(bugReports.createdAt), desc(bugReports.id)).limit(100);
  }
  async update(id: string, status: 'OPEN' | 'RESOLVED') {
    const [row] = await db.update(bugReports).set({ status, updatedAt: new Date() }).where(eq(bugReports.id, id)).returning();
    if (!row) throw new NotFoundException('Bug report not found');
    return row;
  }
}
