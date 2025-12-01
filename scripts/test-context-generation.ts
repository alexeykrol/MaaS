/**
 * Test Context Generation
 *
 * Создает тестовый запрос и проверяет, что контекст собирается по format.md
 */

import { pool } from '../shared/db';

async function testContextGeneration() {
  try {
    console.log('🧪 Testing context generation with new Assembler...\n');

    // Create test query
    const testQuery = 'What are the best months to visit Japan for cherry blossoms?';

    console.log(`📝 Creating test query: "${testQuery}"`);

    // Use test user ID
    const testUserId = '00000000-0000-0000-0000-000000000001';

    const result = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, 'NEW')
       RETURNING id`,
      [testUserId, testQuery]
    );

    const pipelineId = result.rows[0].id;
    console.log(`✅ Created pipeline run: ${pipelineId}`);
    console.log(`⏳ Waiting for pipeline to complete...\n`);

    // Wait for completion (poll every 500ms, max 30 seconds)
    let attempts = 0;
    const maxAttempts = 60;
    let completed = false;

    while (attempts < maxAttempts && !completed) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;

      const statusResult = await pool.query(
        'SELECT status, final_context_payload FROM pipeline_runs WHERE id = $1',
        [pipelineId]
      );

      const status = statusResult.rows[0].status;
      process.stdout.write(`\r⏳ Status: ${status.padEnd(15)} (${attempts * 0.5}s)`);

      if (status === 'COMPLETED') {
        completed = true;
        console.log('\n\n✅ Pipeline completed!\n');

        const context = statusResult.rows[0].final_context_payload;
        console.log('─'.repeat(80));
        console.log('📄 Generated Context:');
        console.log('─'.repeat(80));
        console.log(context);
        console.log('─'.repeat(80));
        console.log(`\n📏 Context length: ${context.length} chars`);

        // Verify it matches format.md structure
        console.log('\n🔍 Verification:');
        const hasSystemRole = context.includes('SYSTEM ROLE:');
        const hasPreviousContext = context.includes('PREVIOUS CONTEXT (from long-term memory):');
        const hasRecentConversation = context.includes('RECENT CONVERSATION:');
        const hasCurrentQuery = context.includes('CURRENT QUERY:');
        const hasInstruction = context.includes('Please respond naturally');

        console.log(`   ${hasSystemRole ? '✅' : '❌'} SYSTEM ROLE section`);
        console.log(`   ${hasPreviousContext ? '✅' : '❌'} PREVIOUS CONTEXT section`);
        console.log(`   ${hasRecentConversation ? '✅' : '❌'} RECENT CONVERSATION section`);
        console.log(`   ${hasCurrentQuery ? '✅' : '❌'} CURRENT QUERY section`);
        console.log(`   ${hasInstruction ? '✅' : '❌'} Instruction present`);

        const allChecks = hasSystemRole && hasPreviousContext && hasRecentConversation && hasCurrentQuery && hasInstruction;
        console.log(`\n${allChecks ? '✅ SUCCESS' : '❌ FAILED'}: Context matches format.md specification\n`);
      } else if (status === 'FAILED') {
        console.log('\n\n❌ Pipeline failed!\n');
        break;
      }
    }

    if (!completed && attempts >= maxAttempts) {
      console.log('\n\n⏱️  Timeout waiting for pipeline completion\n');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testContextGeneration();
