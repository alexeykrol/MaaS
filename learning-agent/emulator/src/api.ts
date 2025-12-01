import { Router, Request, Response } from 'express';
import { TestRunnerEngine, TestMode } from './engine';

/**
 * Test Runner REST API
 *
 * Endpoints:
 * - GET    /api/test-runner/scenarios              - List available scenarios
 * - POST   /api/test-runner/run/:scenarioId        - Run a scenario
 * - GET    /api/test-runner/results/:scenarioId    - Get results for a scenario
 * - POST   /api/test-runner/mode                   - Set test mode (mock/direct/full)
 * - GET    /api/test-runner/status                 - Get current status and mode
 */

const router = Router();

// Singleton Test Runner instance
let testRunner: TestRunnerEngine | null = null;

function getTestRunner(): TestRunnerEngine {
  if (!testRunner) {
    testRunner = new TestRunnerEngine({ mode: TestMode.MOCK });
  }
  return testRunner;
}

/**
 * GET /api/test-runner/scenarios
 * List all available test scenarios
 */
router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const runner = getTestRunner();
    const scenarios = await runner.getScenarios();

    res.json({
      success: true,
      scenarios: scenarios.map(s => ({
        id: s.scenario_id,
        stepCount: s.step_count,
        firstQuery: s.first_query,
        description: `${s.step_count} step scenario: ${s.first_query.substring(0, 60)}...`
      }))
    });
  } catch (error: any) {
    console.error('Error fetching scenarios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/test-runner/run/:scenarioId
 * Run a specific test scenario
 */
router.post('/run/:scenarioId', async (req: Request, res: Response) => {
  const { scenarioId } = req.params;

  try {
    const runner = getTestRunner();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TEST RUNNER - Starting scenario: ${scenarioId}`);
    console.log(`${'='.repeat(60)}`);

    const results = await runner.runScenario(scenarioId);

    const passed = results.filter(r => r.status === 'PASSED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ TEST RUNNER - Scenario complete`);
    console.log(`   Passed: ${passed}/${results.length}`);
    console.log(`   Failed: ${failed}/${results.length}`);
    console.log(`${'='.repeat(60)}\n`);

    res.json({
      success: true,
      scenario_id: scenarioId,
      summary: {
        total: results.length,
        passed,
        failed
      },
      results: results.map(r => ({
        step: r.step,
        status: r.status,
        final_answer: r.final_answer,
        error_message: r.error_message,
        validation: r.validation_result,
        duration_ms: r.completed_at && r.created_at
          ? r.completed_at.getTime() - r.created_at.getTime()
          : null
      }))
    });
  } catch (error: any) {
    console.error(`❌ Error running scenario ${scenarioId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-runner/results/:scenarioId
 * Get historical results for a scenario
 */
router.get('/results/:scenarioId', async (req: Request, res: Response) => {
  const { scenarioId } = req.params;

  try {
    const runner = getTestRunner();
    const results = await runner.getResults(scenarioId);

    res.json({
      success: true,
      scenario_id: scenarioId,
      results: results.map(r => ({
        test_run_id: r.test_run_id,
        step: r.step,
        status: r.status,
        final_answer: r.final_answer,
        error_message: r.error_message,
        validation: r.validation_result,
        created_at: r.created_at,
        completed_at: r.completed_at
      }))
    });
  } catch (error: any) {
    console.error(`Error fetching results for ${scenarioId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/test-runner/mode
 * Set test runner mode
 *
 * Body: { "mode": "mock" | "direct" | "full" }
 */
router.post('/mode', async (req: Request, res: Response) => {
  const { mode } = req.body;

  // Validate mode
  const validModes = Object.values(TestMode);
  if (!validModes.includes(mode)) {
    return res.status(400).json({
      success: false,
      error: `Invalid mode. Must be one of: ${validModes.join(', ')}`,
      validModes
    });
  }

  try {
    const runner = getTestRunner();
    runner.setMode(mode as TestMode);

    res.json({
      success: true,
      mode: mode.toUpperCase(),
      message: `Test Runner mode set to ${mode.toUpperCase()}`
    });
  } catch (error: any) {
    console.error('Error setting mode:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/test-runner/status
 * Get current Test Runner status
 */
router.get('/status', (req: Request, res: Response) => {
  const runner = testRunner;

  res.json({
    success: true,
    status: 'running',
    initialized: runner !== null,
    mode: runner ? runner.getMode().toUpperCase() : 'NOT_INITIALIZED',
    available_modes: Object.values(TestMode).map(m => m.toUpperCase()),
    version: '1.0.0'
  });
});

export default router;
