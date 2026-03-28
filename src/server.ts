import { buildApp } from './app.js';

const app = buildApp();

const start = async () => {
  try {
    await app.listen({
      host: app.config.HOST,
      port: app.config.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
