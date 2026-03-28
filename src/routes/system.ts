import type { FastifyInstance } from 'fastify';

export const systemRoutes = async (app: FastifyInstance) => {
  app.get('/system/architecture', {
    schema: {
      tags: ['system'],
      summary: 'Describe the hybrid crowdfunding architecture'
    }
  }, async () => ({
    data: {
      architecture: app.services.integrationService.describeArchitecture()
    }
  }));

  app.get('/system/integrations', {
    schema: {
      tags: ['system'],
      summary: 'List configured integrations and credential placeholders'
    }
  }, async () => ({
    data: {
      integrations: app.services.integrationService.listIntegrations(),
      credentials: app.services.integrationService.listCredentialTemplates()
    }
  }));
};
