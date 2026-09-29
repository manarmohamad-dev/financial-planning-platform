import { readConfig } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';
import { logger } from './logging.js';
const config = readConfig(process.env);
const pool = createPool(config.DATABASE_URL);
await pool.query('SELECT 1');
const app = await createApp(config, pool);
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'API ready'));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
