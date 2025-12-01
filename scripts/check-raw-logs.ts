/**
 * Check raw_logs contents
 */

import { pool } from '../shared/db';

async function checkRawLogs() {
  try {
    console.log('📊 Checking raw_logs table...\n');

    const testUserId = '00000000-0000-0000-0000-000000000001';

    const result = await pool.query(
      `SELECT
         id,
         pipeline_run_id,
         log_type,
         log_data,
         created_at
       FROM raw_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [testUserId]
    );

    console.log(`Found ${result.rows.length} log entries:\n`);

    for (const row of result.rows) {
      console.log('─'.repeat(80));
      console.log(`📝 Log ID: ${row.id}`);
      console.log(`🔗 Pipeline Run: ${row.pipeline_run_id}`);
      console.log(`📋 Type: ${row.log_type}`);
      console.log(`⏰ Created: ${row.created_at}`);
      console.log(`📄 Data:`);
      console.log(JSON.stringify(row.log_data, null, 2));
      console.log('');
    }

    console.log('─'.repeat(80));

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkRawLogs();
