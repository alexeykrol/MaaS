/**
 * Test Full Pipeline with Agent Stubs
 *
 * Просто создаёт pipeline_run со статусом NEW
 * и ждёт пока pipeline обработает до COMPLETED
 */

import { pool } from './utils/db';

async function testPipeline() {
  console.log('🧪 Testing Full Pipeline with Agent Stubs...\n');

  try {
    // Создать новый pipeline_run
    const result = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [
        '00000000-0000-0000-0000-000000000000',
        'Test full pipeline: What is the meaning of life?',
        'NEW'
      ]
    );

    const row = result.rows[0];
    console.log('✅ Created pipeline_run:');
    console.log('   ID:', row.id);
    console.log('   Status:', row.status);
    console.log('   Created:', row.created_at);
    console.log('');
    console.log('📡 Orchestrator will now process this through the full pipeline:');
    console.log('   NEW → ANALYZING → ANALYZED → ASSEMBLING → READY → RESPONDING → COMPLETED');
    console.log('');
    console.log('⏳ Waiting for pipeline to complete (max 10 seconds)...\n');

    // Polling - ждём COMPLETED или FAILED
    const maxAttempts = 50; // 10 секунд (50 * 200ms)
    let attempts = 0;
    let finalStatus = null;

    while (attempts < maxAttempts) {
      await sleep(200);
      attempts++;

      const checkResult = await pool.query(
        'SELECT status, final_answer FROM pipeline_runs WHERE id = $1',
        [row.id]
      );

      const current = checkResult.rows[0];

      if (current.status === 'COMPLETED') {
        finalStatus = current;
        break;
      }

      if (current.status === 'FAILED') {
        console.error('❌ Pipeline failed!');
        console.error('   Status:', current.status);
        process.exit(1);
      }

      // Показываем прогресс каждые 10 попыток
      if (attempts % 10 === 0) {
        console.log(`   [${attempts * 200}ms] Current status: ${current.status}`);
      }
    }

    if (!finalStatus) {
      console.error('❌ Timeout: Pipeline did not complete within 10 seconds');
      process.exit(1);
    }

    console.log('');
    console.log('🎉 SUCCESS! Pipeline completed!');
    console.log('');
    console.log('📄 Final Answer:');
    console.log('─'.repeat(60));
    console.log(finalStatus.final_answer);
    console.log('─'.repeat(60));
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testPipeline();
