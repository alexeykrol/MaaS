/**
 * Test Script - Trigger NOTIFY Event
 *
 * Creates a pipeline_run to test Orchestrator LISTEN/NOTIFY
 */

import { pool } from './utils/db';

async function testNotify() {
  console.log('🧪 Testing NOTIFY trigger...\n');

  try {
    // Insert a new pipeline_run
    const result = await pool.query(
      `INSERT INTO pipeline_runs (user_id, user_query, status)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      ['00000000-0000-0000-0000-000000000000', 'Test query for Orchestrator NOTIFY', 'NEW']
    );

    const row = result.rows[0];
    console.log('✅ Created pipeline_run:');
    console.log('   ID:', row.id);
    console.log('   Status:', row.status);
    console.log('   Created:', row.created_at);
    console.log('');
    console.log('📡 PostgreSQL trigger should have sent NOTIFY to Orchestrator');
    console.log('   Check Orchestrator logs for: "Event received"');
    console.log('');

    // Wait a moment to let the NOTIFY propagate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update status to trigger another NOTIFY
    console.log('🔄 Updating status to ANALYZING...');
    await pool.query(
      `UPDATE pipeline_runs
       SET status = 'ANALYZING', updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );

    console.log('✅ Status updated - another NOTIFY sent');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testNotify();
