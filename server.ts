import express, { Application, Request, Response } from 'express';
import * as path from 'path';
import * as dotenv from 'dotenv';
import testRunnerAPI from './learning-agent/emulator/src/api';
import emulatorAPI from './learning-agent/emulator/src/emulator-api';
import { testConnection } from './shared/db';
import { Orchestrator } from './maas/src/orchestrator';

dotenv.config();

// Global orchestrator instance for graceful shutdown
let orchestrator: Orchestrator | null = null;

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (for Test Runner UI and Emulator)
app.use('/test-runner', express.static(path.join(__dirname, 'learning-agent/emulator/public')));

// Emulator page
app.get('/emulator', (req: Request, res: Response) => {
  const filePath = path.resolve(__dirname, 'learning-agent/emulator/public/emulator.html');
  console.log('Serving emulator from:', filePath);
  res.sendFile(filePath);
});

// API Routes
app.use('/api/test-runner', testRunnerAPI);
app.use('/api/emulator', emulatorAPI);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'MaaS MVP',
    version: '0.2.0',
    description: 'Memory as a Service - Event-Driven AI Mentor with Long-term Semantic Memory',
    structure: {
      maas: 'Product (deliverable) - agents, orchestrator, api',
      'learning-agent': 'Training tool - emulator, sensor, analyst, teacher, tuner',
      shared: 'Common infrastructure - db, logger, openai'
    },
    endpoints: {
      testRunner: '/test-runner',
      emulator: '/emulator',
      api: {
        scenarios: 'GET /api/test-runner/scenarios',
        run: 'POST /api/test-runner/run/:scenarioId',
        results: 'GET /api/test-runner/results/:scenarioId',
        mode: 'POST /api/test-runner/mode',
        status: 'GET /api/test-runner/status'
      }
    },
    status: 'running'
  });
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      status: 'healthy',
      database: dbConnected ? 'connected' : 'disconnected',
      orchestrator: orchestrator ? 'running' : 'stopped',
      pipelineMode: orchestrator ? 'enabled' : 'disabled',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'error',
      orchestrator: orchestrator ? 'running' : 'stopped',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
async function start() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('Failed to connect to database. Please check your .env configuration.');
      console.error('   Run: npm run db:test');
      process.exit(1);
    }

    // Start Orchestrator (for Pipeline mode)
    console.log('Starting Orchestrator...');
    orchestrator = new Orchestrator();
    await orchestrator.start();
    console.log('Orchestrator started (listening for pipeline events)');

    // Start HTTP server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('MaaS MVP Server Started');
      console.log('='.repeat(60));
      console.log(`   Server:      http://localhost:${PORT}`);
      console.log(`   Emulator:    http://localhost:${PORT}/emulator`);
      console.log(`   Test Runner: http://localhost:${PORT}/test-runner`);
      console.log(`   API Docs:    http://localhost:${PORT}/`);
      console.log(`   Health:      http://localhost:${PORT}/health`);
      console.log('='.repeat(60));
      console.log('\nOrchestrator: RUNNING (Pipeline mode enabled)');
      console.log('\nQuick Start:');
      console.log('   1. Open http://localhost:' + PORT + '/emulator');
      console.log('   2. Select "Pipeline (MaaS Memory)" mode');
      console.log('   3. Click "Start Emulation"');
      console.log('');
    });
  } catch (error: any) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n\nReceived ${signal}, shutting down...`);

  if (orchestrator) {
    console.log('Stopping Orchestrator...');
    await orchestrator.stop();
    console.log('Orchestrator stopped');
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the server
start();
