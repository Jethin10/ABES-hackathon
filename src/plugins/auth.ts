import fp from 'fastify-plugin';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../core/errors.js';
import type { AuthUser, UserRole } from '../domain/types.js';

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.register(import('@fastify/jwt'), {
    secret: app.config.JWT_SECRET
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const payload = await request.jwtVerify<AuthUser>();
      request.currentUser = payload;
    }
  );

  app.decorate(
    'requireRoles',
    (roles: UserRole[]) =>
      async (request: FastifyRequest, _reply: FastifyReply) => {
        const currentUser = request.currentUser;
        if (!currentUser || !roles.includes(currentUser.role)) {
          throw new AppError('You do not have permission to perform this action.', 403, 'ROLE_NOT_ALLOWED');
        }
      }
  );
});
