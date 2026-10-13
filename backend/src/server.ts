import { env } from './config/env.js';
import { createRepository } from './config/database.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';

const repo = createRepository();
const app = createApp(repo);

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      storage: repo.kind,
      ai: env.GEMINI_API_KEY ? env.GEMINI_MODEL : 'heuristic-only',
      concurrency: env.CONCURRENCY_LIMIT,
    },
    'APIsentry backend listening',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    repo.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
