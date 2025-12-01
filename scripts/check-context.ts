/**
 * Check Context Generation
 *
 * Проверяет, как Assembler собрал контекст в последних запросах
 */

import { pool } from '../shared/db';

async function checkContext() {
  try {
    console.log('📊 Checking last 3 generated contexts...\n');

    const result = await pool.query(`
      SELECT
        id,
        user_query,
        status,
        LENGTH(final_context_payload) as context_length,
        final_context_payload,
        created_at
      FROM pipeline_runs
      ORDER BY created_at DESC
      LIMIT 3
    `);

    for (const row of result.rows) {
      console.log('─'.repeat(80));
      console.log(`📝 Request ID: ${row.id}`);
      console.log(`📅 Created: ${row.created_at}`);
      console.log(`❓ Query: ${row.user_query}`);
      console.log(`📊 Status: ${row.status}`);
      console.log(`📏 Context Length: ${row.context_length} chars`);
      console.log(`\n📄 Generated Context:\n`);
      console.log(row.final_context_payload || '(No context generated)');
      console.log('\n');
    }

    console.log('─'.repeat(80));
    console.log('✅ Check complete\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkContext();
