import { randomUUID } from 'node:crypto';

import type { DatabaseClient } from '../db/database.js';
import { nowIso } from '../core/utils.js';

export class AuditService {
  constructor(private readonly db: DatabaseClient) {}

  async record(input: {
    actorId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    payload: unknown;
  }) {
    await this.db.run(`
      INSERT INTO audit_logs (id, actor_id, entity_type, entity_id, action, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      randomUUID(),
      input.actorId ?? null,
      input.entityType,
      input.entityId,
      input.action,
      JSON.stringify(input.payload),
      nowIso()
    ]);
  }

  async listForEntity(entityType: string, entityId: string): Promise<Array<{
    id: string;
    actorId: string | null;
    action: string;
    payload: string;
    createdAt: string;
  }>> {
    return this.db.all(`
      SELECT id, actor_id as actorId, action, payload, created_at as createdAt
      FROM audit_logs
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC
    `, [entityType, entityId]);
  }
}
