import { Orchestrator } from './maas/src/orchestrator';
import { testConnection } from './shared/db';
import { logger } from './shared/logger';

/**
 * MaaS Orchestrator - Entry Point
 *
 * Standalone process that listens to PostgreSQL NOTIFY events
 * and coordinates the event-driven pipeline.
 */
async function main() {
  console.log('');
  console.log('MaaS MVP - Orchestrator');
  console.log('Event-Driven Pipeline Coordinator');
  console.log('');

  // Test DB connection
  logger.info('Testing database connection...');
  const connected = await testConnection();

  if (!connected) {
    logger.error('Failed to connect to database. Exiting...');
    process.exit(1);
  }

  // Create and start Orchestrator
  const orchestrator = new Orchestrator();

  try {
    await orchestrator.start();
  } catch (error) {
    logger.error('Failed to start Orchestrator:', error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log('');
    logger.info(`\nReceived ${signal}, shutting down gracefully...`);

    try {
      await orchestrator.stop();
      logger.info('Orchestrator stopped');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process alive
  logger.info('');
  logger.info('Press Ctrl+C to stop');
  logger.info('');
}

// Run
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
