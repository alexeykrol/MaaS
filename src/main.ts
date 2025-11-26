import { Orchestrator } from './orchestrator';
import { testConnection } from './utils/db';
import { logger } from './utils/logger';

/**
 * MaaS Orchestrator - Entry Point
 *
 * Standalone process that listens to PostgreSQL NOTIFY events
 * and coordinates the event-driven pipeline.
 */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   MaaS MVP - Orchestrator                 ║');
  console.log('║   Event-Driven Pipeline Coordinator       ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');

  // Проверка подключения к БД
  logger.info('🔌 Testing database connection...');
  const connected = await testConnection();

  if (!connected) {
    logger.error('❌ Failed to connect to database. Exiting...');
    process.exit(1);
  }

  // Создание и запуск Orchestrator
  const orchestrator = new Orchestrator();

  try {
    await orchestrator.start();
  } catch (error) {
    logger.error('❌ Failed to start Orchestrator:', error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log('');
    logger.info(`\n👋 Received ${signal}, shutting down gracefully...`);

    try {
      await orchestrator.stop();
      logger.info('✅ Orchestrator stopped');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  logger.info('');
  logger.info('💡 Press Ctrl+C to stop');
  logger.info('');
}

// Run
main().catch((error) => {
  logger.error('❌ Fatal error:', error);
  process.exit(1);
});
