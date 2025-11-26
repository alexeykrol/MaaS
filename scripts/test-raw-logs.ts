/**
 * Test raw_logs Logging
 *
 * Запускает 2 запроса подряд, чтобы проверить:
 * 1. Логирование в raw_logs
 * 2. Чтение recent conversation из raw_logs
 */

import { pool } from '../src/utils/db';

async function testRawLogs() {
  try {
    console.log('🧪 Testing raw_logs logging and retrieval...\n');

    const testUserId = '00000000-0000-0000-0000-000000000001';

    // Test 1: First query (should have no recent conversation)
    console.log('═'.repeat(80));
    console.log('📝 TEST 1: First query (empty raw_logs)');
    console.log('═'.repeat(80));

    const query1 = 'Tell me about Japanese temples';

    console.log(`\n📤 Sending query: "${query1}"`);

    const result1 = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, 'NEW')
       RETURNING id`,
      [testUserId, query1]
    );

    const pipelineId1 = result1.rows[0].id;
    console.log(`✅ Created pipeline run: ${pipelineId1}`);
    console.log(`⏳ Waiting for completion...\n`);

    // Wait for completion
    await waitForCompletion(pipelineId1);

    // Check raw_logs
    const logs1 = await pool.query(
      `SELECT COUNT(*) as count FROM raw_logs WHERE pipeline_run_id = $1`,
      [pipelineId1]
    );

    console.log(`✅ Test 1 completed!`);
    console.log(`   📊 raw_logs entries: ${logs1.rows[0].count} (expected: 2 - query + answer)`);

    // Test 2: Second query (should include Test 1 in recent conversation)
    console.log('\n' + '═'.repeat(80));
    console.log('📝 TEST 2: Second query (should have recent conversation from Test 1)');
    console.log('═'.repeat(80));

    const query2 = 'Which temple is the most famous?';

    console.log(`\n📤 Sending query: "${query2}"`);

    const result2 = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, 'NEW')
       RETURNING id`,
      [testUserId, query2]
    );

    const pipelineId2 = result2.rows[0].id;
    console.log(`✅ Created pipeline run: ${pipelineId2}`);
    console.log(`⏳ Waiting for completion...\n`);

    await waitForCompletion(pipelineId2);

    // Check context for Test 2
    const context2 = await pool.query(
      `SELECT final_context_payload FROM pipeline_runs WHERE id = $1`,
      [pipelineId2]
    );

    const contextText = context2.rows[0].final_context_payload;
    const hasRecentConversation = contextText.includes('RECENT CONVERSATION:');
    const includesFirstQuery = contextText.includes('Tell me about Japanese temples');

    console.log(`✅ Test 2 completed!`);
    console.log(`   📊 Context includes RECENT CONVERSATION: ${hasRecentConversation ? '✅ YES' : '❌ NO'}`);
    console.log(`   📊 Context includes Test 1 query: ${includesFirstQuery ? '✅ YES' : '❌ NO'}`);

    // Show context preview
    console.log('\n' + '─'.repeat(80));
    console.log('📄 Generated Context (Test 2):');
    console.log('─'.repeat(80));
    console.log(contextText);
    console.log('─'.repeat(80));

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(80));
    console.log(`✅ Test 1: Logging to raw_logs works (${logs1.rows[0].count} entries)`);
    console.log(`${hasRecentConversation && includesFirstQuery ? '✅' : '❌'} Test 2: Reading from raw_logs works`);
    console.log('═'.repeat(80) + '\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

async function waitForCompletion(pipelineId: string): Promise<void> {
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;

    const result = await pool.query(
      'SELECT status FROM pipeline_runs WHERE id = $1',
      [pipelineId]
    );

    const status = result.rows[0].status;
    process.stdout.write(`\r   ⏳ Status: ${status.padEnd(15)} (${attempts * 0.5}s)`);

    if (status === 'COMPLETED') {
      console.log('');
      return;
    } else if (status === 'FAILED') {
      throw new Error('Pipeline failed');
    }
  }

  throw new Error('Timeout waiting for completion');
}

testRawLogs();
