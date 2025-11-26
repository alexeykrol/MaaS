/**
 * Check LSM Storage contents
 */

import { pool } from '../src/utils/db';

async function checkLSM() {
  try {
    console.log('📊 Checking LSM storage...\n');

    const testUserId = '00000000-0000-0000-0000-000000000001';

    const result = await pool.query(
      `SELECT
         id,
         time_bucket,
         semantic_tags,
         summary_text,
         source_run_ids,
         created_at
       FROM lsm_storage
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [testUserId]
    );

    console.log(`Found ${result.rows.length} LSM entries:\n`);

    for (const row of result.rows) {
      console.log('═'.repeat(80));
      console.log(`📝 LSM Entry: ${row.id}`);
      console.log(`📅 Time Bucket: ${row.time_bucket}`);
      console.log(`⏰ Created: ${row.created_at}`);
      console.log(`🏷️  Tags (${row.semantic_tags.length}): ${row.semantic_tags.join(', ')}`);
      console.log(`🔗 Source Runs: ${row.source_run_ids ? row.source_run_ids.length : 0}`);
      console.log(`📄 Summary:`);
      console.log(`   ${row.summary_text}`);
      console.log('');
    }

    console.log('═'.repeat(80));

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkLSM();
