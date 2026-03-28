import type { FastifyReply, FastifyRequest } from 'fastify';

import type { env } from '../config/env.js';
import type { DatabaseClient } from '../db/database.js';
import type { AuthUser, UserRole } from '../domain/types.js';
import type { AuditService } from '../services/audit-service.js';
import type { CampaignService } from '../services/campaign-service.js';
import type { EscrowService } from '../services/escrow-service.js';
import type { EscrowSyncService } from '../services/escrow-sync-service.js';
import type { IntegrationService } from '../services/integration-service.js';
import type { TreasuryService } from '../services/treasury-service.js';
import type { UserService } from '../services/user-service.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseClient;
    config: typeof env;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    services: {
      auditService: AuditService;
      campaignService: CampaignService;
      escrowService: EscrowService;
      escrowSyncService: EscrowSyncService;
      integrationService: IntegrationService;
      treasuryService: TreasuryService;
      userService: UserService;
    };
  }

  interface FastifyRequest {
    currentUser: AuthUser;
  }
}

export {};
