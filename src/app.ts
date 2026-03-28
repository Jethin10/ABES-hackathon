import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import { AppError, isAppError } from './core/errors.js';
import type { DatabaseClient } from './db/database.js';
import { createDatabaseClient } from './db/database.js';
import { authPlugin } from './plugins/auth.js';
import { servicesPlugin } from './plugins/services.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { healthRoutes } from './routes/health.js';
import { systemRoutes } from './routes/system.js';

export const buildApp = (options?: { databasePath?: string }) => {
  const app = Fastify({
    logger: {
      level: 'info'
    }
  });

  const useEphemeralSqlite = Boolean(options?.databasePath);
  const db = createDatabaseClient(
    useEphemeralSqlite
      ? {
          engine: 'sqlite',
          databasePath: options?.databasePath ?? env.DATABASE_PATH
        }
      : env.DATABASE_URL
        ? {
            engine: env.DATABASE_ENGINE,
            databasePath: env.DATABASE_PATH,
            databaseUrl: env.DATABASE_URL
          }
        : {
            engine: env.DATABASE_ENGINE,
            databasePath: env.DATABASE_PATH
          }
  );

  app.decorate('config', {
    ...env,
    DATABASE_PATH: options?.databasePath ?? env.DATABASE_PATH,
    DATABASE_ENGINE: useEphemeralSqlite ? 'sqlite' : env.DATABASE_ENGINE
  });
  app.decorate('db', db as DatabaseClient);
  app.addHook('onReady', async () => {
    await db.init();
  });
  app.addHook('onClose', async (instance) => {
    await instance.db.close();
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: 'Stellaris Backend API',
        version: '1.0.0',
        description: 'Backend for milestone-based crowdfunding with escrow, voting, and treasury orchestration.'
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      }
    }
  });

  app.register(swaggerUi, {
    routePrefix: '/docs'
  });

  app.register(authPlugin);
  app.register(servicesPlugin);
  app.register(healthRoutes, { prefix: '/api' });
  app.register(systemRoutes, { prefix: '/api' });
  app.register(authRoutes, { prefix: '/api' });
  app.register(campaignRoutes, { prefix: '/api' });
  app.register(adminRoutes, { prefix: '/api' });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null
        }
      });
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: error
        }
      });
    }

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.'
      }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route not found.'
      }
    });
  });

  return app;
};
