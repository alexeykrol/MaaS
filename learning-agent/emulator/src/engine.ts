import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../../shared/db';
import { simpleQuery } from '../../../shared/openai';

/**
 * Test Runner Engine
 *
 * Runs pre-defined test scenarios against the MaaS system.
 * Supports three modes:
 * 1. MOCK: Simulates responses without running pipeline (for quick testing)
 * 2. DIRECT: Calls OpenAI directly without memory/context (baseline)
 * 3. FULL: Runs full pipeline with memory and context (real system)
 */

export enum TestMode {
  MOCK = 'mock',
  DIRECT = 'direct',
  FULL = 'full'
}

export interface TestStep {
  id: string;
  scenario_id: string;
  step: number;
  user_query: string;
  expected_keyword: string | null;
  metadata: any;
}

export interface TestResult {
  test_run_id: string;
  scenario_id: string;
  step: number;
  status: 'RUNNING' | 'PASSED' | 'FAILED';
  final_answer: string | null;
  error_message: string | null;
  validation_result: any;
  created_at: Date;
  completed_at: Date | null;
}

export class TestRunnerEngine extends EventEmitter {
  private userId: string;
  private mode: TestMode;

  constructor(options: { userId?: string; mode?: TestMode } = {}) {
    super();
    this.userId = options.userId || process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000000';
    this.mode = options.mode || TestMode.MOCK;

    console.log(`🧪 Test Runner initialized (${this.mode.toUpperCase()} mode)`);
  }

  /**
   * Get list of available test scenarios
   */
  async getScenarios(): Promise<Array<{ scenario_id: string; step_count: number; first_query: string }>> {
    const result = await pool.query(`
      SELECT
        scenario_id,
        COUNT(*) as step_count,
        MIN(step) as first_step
      FROM test_dialogs
      GROUP BY scenario_id
      ORDER BY scenario_id
    `);

    const scenarios = [];
    for (const row of result.rows) {
      const firstQuery = await pool.query(
        'SELECT user_query FROM test_dialogs WHERE scenario_id = $1 AND step = $2',
        [row.scenario_id, row.first_step]
      );
      scenarios.push({
        scenario_id: row.scenario_id,
        step_count: parseInt(row.step_count),
        first_query: firstQuery.rows[0].user_query
      });
    }

    return scenarios;
  }

  /**
   * Run a complete test scenario
   */
  async runScenario(scenarioId: string): Promise<TestResult[]> {
    console.log(`\n🚀 Running scenario: ${scenarioId}`);

    // Get all steps for this scenario
    const steps = await pool.query(
      'SELECT * FROM test_dialogs WHERE scenario_id = $1 ORDER BY step ASC',
      [scenarioId]
    );

    if (steps.rows.length === 0) {
      throw new Error(`No steps found for scenario ${scenarioId}`);
    }

    const results: TestResult[] = [];

    // Run each step sequentially
    for (const stepData of steps.rows) {
      const result = await this.runStep(scenarioId, stepData);
      results.push(result);

      // Emit progress event
      this.emit('step-complete', result);

      // Stop if step failed
      if (result.status === 'FAILED') {
        console.log(`❌ Scenario failed at step ${stepData.step}`);
        break;
      }
    }

    console.log(`✅ Scenario complete: ${scenarioId} (${results.filter(r => r.status === 'PASSED').length}/${results.length} passed)`);
    return results;
  }

  /**
   * Run a single test step
   */
  private async runStep(scenarioId: string, stepData: TestStep): Promise<TestResult> {
    const { step, user_query, expected_keyword } = stepData;

    console.log(`  📝 Step ${step}: "${user_query.substring(0, 50)}..."`);

    // 1. Create pipeline_runs entry
    const pipelineResult = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, 'NEW')
       RETURNING id`,
      [this.userId, user_query]
    );
    const pipelineRunId = pipelineResult.rows[0].id;

    // 2. Create test_runs entry
    const testRunResult = await pool.query(
      `INSERT INTO test_runs (scenario_id, step, pipeline_run_id, status, created_at)
       VALUES ($1, $2, $3, 'RUNNING', NOW())
       RETURNING id`,
      [scenarioId, step, pipelineRunId]
    );
    const testRunId = testRunResult.rows[0].id;

    try {
      // 3. Get response based on mode
      let finalAnswer: string;

      switch (this.mode) {
        case TestMode.MOCK:
          finalAnswer = await this.simulateResponse(user_query);
          break;

        case TestMode.DIRECT:
          finalAnswer = await this.directOpenAIResponse(user_query);
          break;

        case TestMode.FULL:
          finalAnswer = await this.waitForCompletion(pipelineRunId);
          break;

        default:
          throw new Error(`Unknown test mode: ${this.mode}`);
      }

      // 4. Validate response
      const validation = this.validateResponse(finalAnswer, expected_keyword);

      // 5. Update test_runs
      await pool.query(
        `UPDATE test_runs
         SET status = $1, final_answer = $2, validation_result = $3, completed_at = NOW()
         WHERE id = $4`,
        [
          validation.passed ? 'PASSED' : 'FAILED',
          finalAnswer,
          JSON.stringify(validation),
          testRunId
        ]
      );

      const statusEmoji = validation.passed ? '✅' : '❌';
      console.log(`  ${statusEmoji} Step ${step}: ${validation.passed ? 'PASSED' : 'FAILED'}`);
      if (!validation.passed) {
        console.log(`     Reason: ${validation.reason}`);
      }

      return {
        test_run_id: testRunId,
        scenario_id: scenarioId,
        step,
        status: validation.passed ? 'PASSED' : 'FAILED',
        final_answer: finalAnswer,
        error_message: null,
        validation_result: validation,
        created_at: new Date(),
        completed_at: new Date()
      };

    } catch (error: any) {
      console.log(`  ❌ Step ${step}: ERROR - ${error.message}`);

      // Update test_runs with error
      await pool.query(
        `UPDATE test_runs
         SET status = 'FAILED', error_message = $1, completed_at = NOW()
         WHERE id = $2`,
        [error.message, testRunId]
      );

      return {
        test_run_id: testRunId,
        scenario_id: scenarioId,
        step,
        status: 'FAILED',
        final_answer: null,
        error_message: error.message,
        validation_result: { passed: false, reason: error.message },
        created_at: new Date(),
        completed_at: new Date()
      };
    }
  }

  /**
   * Mock Mode: Simulate a response (for quick testing)
   */
  private async simulateResponse(query: string): Promise<string> {
    // Simulate processing delay
    await this.sleep(500);

    // Generate mock response
    const responses = [
      `Mock response to: "${query}"`,
      `This is a simulated answer for: "${query}"`,
      `Testing mode: I would answer "${query}" here`,
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];
    return response;
  }

  /**
   * Direct Mode: Call OpenAI directly (baseline without memory)
   */
  private async directOpenAIResponse(query: string): Promise<string> {
    console.log(`    🔗 Calling OpenAI directly (no memory)...`);

    try {
      const answer = await simpleQuery(query, {
        model: 'gpt-4o-mini',
        systemPrompt: 'You are a helpful AI assistant. Provide clear, concise, and accurate answers.'
      });

      console.log(`    ✅ OpenAI responded (${answer.length} chars)`);
      return answer;
    } catch (error: any) {
      console.error(`    ❌ OpenAI error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Full Mode: Wait for pipeline to complete (with memory and context)
   */
  private async waitForCompletion(pipelineRunId: string, maxWaitMs: number = 30000): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 200; // Check every 200ms

    while (Date.now() - startTime < maxWaitMs) {
      const result = await pool.query(
        'SELECT status, final_answer, error_message FROM pipeline_runs WHERE id = $1',
        [pipelineRunId]
      );

      const row = result.rows[0];

      if (row.status === 'COMPLETED') {
        return row.final_answer;
      }

      if (row.status === 'FAILED') {
        throw new Error(`Pipeline failed: ${row.error_message}`);
      }

      // Still processing, wait and check again
      await this.sleep(pollInterval);
    }

    throw new Error(`Timeout waiting for pipeline completion (${maxWaitMs}ms)`);
  }

  /**
   * Validate response against expected criteria
   */
  private validateResponse(response: string | null, expectedKeyword: string | null): any {
    if (!response) {
      return {
        passed: false,
        reason: 'No response received',
        expected_keyword: expectedKeyword
      };
    }

    // If no keyword specified, just check that response exists
    if (!expectedKeyword) {
      return {
        passed: true,
        reason: 'Response received (no keyword validation)',
        response_length: response.length
      };
    }

    // Check if response contains expected keyword (case-insensitive)
    const containsKeyword = response.toLowerCase().includes(expectedKeyword.toLowerCase());

    return {
      passed: containsKeyword,
      reason: containsKeyword
        ? `Response contains expected keyword: "${expectedKeyword}"`
        : `Response does not contain expected keyword: "${expectedKeyword}"`,
      expected_keyword: expectedKeyword,
      response_length: response.length
    };
  }

  /**
   * Get test results for a scenario
   */
  async getResults(scenarioId: string): Promise<TestResult[]> {
    const result = await pool.query(
      `SELECT * FROM test_runs
       WHERE scenario_id = $1
       ORDER BY created_at DESC, step ASC
       LIMIT 20`,
      [scenarioId]
    );

    return result.rows.map(row => ({
      test_run_id: row.id,
      scenario_id: row.scenario_id,
      step: row.step,
      status: row.status,
      final_answer: row.final_answer,
      error_message: row.error_message,
      validation_result: row.validation_result,
      created_at: row.created_at,
      completed_at: row.completed_at
    }));
  }

  /**
   * Set test mode
   */
  setMode(mode: TestMode): void {
    this.mode = mode;
    console.log(`🔄 Test Runner mode changed to: ${mode.toUpperCase()}`);
  }

  /**
   * Get current mode
   */
  getMode(): TestMode {
    return this.mode;
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use setMode() instead
   */
  setMockMode(enabled: boolean): void {
    this.mode = enabled ? TestMode.MOCK : TestMode.FULL;
    console.log(`🔄 Test Runner mode changed to: ${this.mode.toUpperCase()}`);
  }

  /**
   * Helper: Sleep for N milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
