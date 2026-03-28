import { buildApp } from '../app.js';

const app = buildApp();

const main = async () => {
  await app.ready();
  const result = await app.services.escrowSyncService.sync();
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app.close();
  });
