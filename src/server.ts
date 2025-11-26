import express, { Application, Request, Response } from 'express';
import * as path from 'path';
import * as dotenv from 'dotenv';
import testRunnerAPI from './test-runner/api';
import { testConnection } from './utils/db';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (for Test Runner UI)
app.use('/test-runner', express.static(path.join(__dirname, '../public/test-runner')));

// API Routes
app.use('/api/test-runner', testRunnerAPI);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'MaaS MVP',
    version: '0.1.0',
    description: 'Memory as a Service - Event-Driven AI Mentor',
    endpoints: {
      testRunner: '/test-runner',
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
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'error',
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
    console.log('🔌 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Please check your .env configuration.');
      console.error('   Run: npm run db:test');
      process.exit(1);
    }

    // Start HTTP server
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 MaaS MVP Server Started');
      console.log('='.repeat(60));
      console.log(`   Server:      http://localhost:${PORT}`);
      console.log(`   Test Runner: http://localhost:${PORT}/test-runner`);
      console.log(`   API Docs:    http://localhost:${PORT}/`);
      console.log(`   Health:      http://localhost:${PORT}/health`);
      console.log('='.repeat(60));
      console.log('\n📋 Available Endpoints:');
      console.log('   GET  /api/test-runner/scenarios');
      console.log('   POST /api/test-runner/run/:scenarioId');
      console.log('   GET  /api/test-runner/results/:scenarioId');
      console.log('   POST /api/test-runner/mode');
      console.log('   GET  /api/test-runner/status');
      console.log('\n💡 Quick Start:');
      console.log('   1. Open http://localhost:' + PORT + '/test-runner in your browser');
      console.log('   2. Click "RUN ▶" on any scenario');
      console.log('   3. Watch the tests execute in mock mode');
      console.log('\n🔧 To run Orchestrator (for real mode):');
      console.log('   npm run orchestrator');
      console.log('');
    });
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});

// Start the server
start();
