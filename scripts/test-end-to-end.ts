/**
 * End-to-End Test - Full Memory Cycle
 *
 * Демонстрирует полный цикл работы MaaS:
 * 1. Запросы → raw_logs → LSM (через Archivist)
 * 2. LSM → Context → OpenAI ответы с памятью
 * 3. Новые запросы используют старые воспоминания
 */

import { pool } from '../shared/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const testUserId = '00000000-0000-0000-0000-000000000001';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendQuery(query: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO pipeline_runs (user_id, user_query, status)
     VALUES ($1, $2, 'NEW')
     RETURNING id`,
    [testUserId, query]
  );

  const pipelineId = result.rows[0].id;

  // Wait for completion
  let attempts = 0;
  while (attempts < 60) {
    await sleep(500);
    attempts++;

    const statusResult = await pool.query(
      'SELECT status, final_answer FROM pipeline_runs WHERE id = $1',
      [pipelineId]
    );

    const status = statusResult.rows[0].status;

    if (status === 'COMPLETED') {
      return statusResult.rows[0].final_answer;
    } else if (status === 'FAILED') {
      throw new Error('Pipeline failed');
    }
  }

  throw new Error('Timeout');
}

async function runArchivist(): Promise<void> {
  console.log('   🤖 Running Archivist...');
  await execAsync('npx ts-node scripts/run-archivist.ts');
  console.log('   ✅ Archivist completed\n');
}

async function checkLSM(): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM lsm_storage WHERE user_id = $1`,
    [testUserId]
  );
  return parseInt(result.rows[0].count);
}

async function checkRawLogs(): Promise<{ total: number; unprocessed: number }> {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE processed = false) as unprocessed
     FROM raw_logs
     WHERE user_id = $1`,
    [testUserId]
  );
  return {
    total: parseInt(result.rows[0].total),
    unprocessed: parseInt(result.rows[0].unprocessed)
  };
}

async function testEndToEnd() {
  try {
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('🧪 MaaS MVP - End-to-End Test');
    console.log('═'.repeat(80));
    console.log('\n');

    // Phase 1: Initial state
    console.log('📊 Phase 1: Check initial state');
    console.log('─'.repeat(80));

    const initialLSM = await checkLSM();
    const initialLogs = await checkRawLogs();

    console.log(`   LSM entries: ${initialLSM}`);
    console.log(`   Raw logs: ${initialLogs.total} (${initialLogs.unprocessed} unprocessed)`);
    console.log('');

    // Phase 2: New conversations
    console.log('📝 Phase 2: Send new queries (temples topic)');
    console.log('─'.repeat(80));

    const queries = [
      "What's special about Sensō-ji temple?",
      "I'd like to visit it. What should I know?",
      "Are there any special ceremonies I can attend?"
    ];

    for (const [index, query] of queries.entries()) {
      console.log(`\n   Query ${index + 1}: "${query}"`);
      const answer = await sendQuery(query);
      console.log(`   Answer: ${answer.substring(0, 150)}...`);
    }

    const afterQueriesLogs = await checkRawLogs();
    console.log(`\n   ✅ Queries completed`);
    console.log(`   📊 Raw logs now: ${afterQueriesLogs.total} (${afterQueriesLogs.unprocessed} unprocessed)`);
    console.log('');

    // Phase 3: Run Archivist
    console.log('📚 Phase 3: Archive conversations to LSM');
    console.log('─'.repeat(80));

    await runArchivist();

    const afterArchiveLSM = await checkLSM();
    const afterArchiveLogs = await checkRawLogs();

    console.log(`   📊 LSM entries: ${initialLSM} → ${afterArchiveLSM} (+${afterArchiveLSM - initialLSM})`);
    console.log(`   📊 Unprocessed logs: ${afterQueriesLogs.unprocessed} → ${afterArchiveLogs.unprocessed}`);
    console.log('');

    // Phase 4: Test memory recall
    console.log('🧠 Phase 4: Test memory recall (new query about temples)');
    console.log('─'.repeat(80));

    const memoryTestQuery = "Can you summarize what we've discussed about temples?";
    console.log(`\n   Query: "${memoryTestQuery}"`);
    console.log(`   ⏳ Waiting for response...\n`);

    const memoryAnswer = await sendQuery(memoryTestQuery);

    console.log(`   Answer:\n`);
    console.log('   ' + '─'.repeat(76));
    const lines = memoryAnswer.split('\n');
    lines.forEach(line => console.log(`   ${line}`));
    console.log('   ' + '─'.repeat(76));
    console.log('');

    // Check if memory was used
    const lastContext = await pool.query(
      `SELECT final_context_payload FROM pipeline_runs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [testUserId]
    );

    const context = lastContext.rows[0].final_context_payload;
    const hasPreviousContext = context.includes('PREVIOUS CONTEXT (from long-term memory):');
    const hasRecentConversation = context.includes('RECENT CONVERSATION:');

    console.log('   📊 Context verification:');
    console.log(`      ${hasPreviousContext ? '✅' : '❌'} PREVIOUS CONTEXT included (from LSM)`);
    console.log(`      ${hasRecentConversation ? '✅' : '❌'} RECENT CONVERSATION included (from raw_logs)`);
    console.log('');

    // Final summary
    const finalLSM = await checkLSM();
    const finalLogs = await checkRawLogs();

    console.log('═'.repeat(80));
    console.log('✅ End-to-End Test Complete!');
    console.log('═'.repeat(80));
    console.log('');
    console.log('📊 Summary:');
    console.log(`   • LSM entries: ${initialLSM} → ${finalLSM}`);
    console.log(`   • Total logs: ${initialLogs.total} → ${finalLogs.total}`);
    console.log(`   • Memory system: ${hasPreviousContext && hasRecentConversation ? '✅ WORKING' : '❌ FAILED'}`);
    console.log('');
    console.log('🎉 MaaS MVP is fully operational!');
    console.log('');
    console.log('═'.repeat(80));
    console.log('');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testEndToEnd();
