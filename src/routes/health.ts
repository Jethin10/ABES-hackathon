import type { FastifyInstance } from 'fastify';

export const healthRoutes = async (app: FastifyInstance) => {
  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Health check'
    }
  }, async () => ({
    data: {
      status: 'ok',
      service: 'stellaris-backend',
      timestamp: new Date().toISOString()
    }
  }));
};
