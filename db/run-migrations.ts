#!/usr/bin/env ts-node

/**
 * Database Migration Runner
 * Runs schema.sql and seeds.sql against Supabase
 *
 * Usage:
 *   ts-node db/run-migrations.ts          # Run both schema and seeds
 *   ts-node db/run-migrations.ts schema   # Run schema only
 *   ts-node db/run-migrations.ts seeds    # Run seeds only
 */

import * as fs from 'fs';
import * as path from 'path';
import { pool, closePool } from '../src/utils/db';

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SEEDS_FILE = path.join(__dirname, 'seeds.sql');

async function runSqlFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }

  console.log(`\n📂 Running ${fileName}...`);

  const sql = fs.readFileSync(filePath, 'utf-8');

  try {
    await pool.query(sql);
    console.log(`✅ ${fileName} executed successfully`);
  } catch (error: any) {
    console.error(`❌ Error executing ${fileName}:`);
    console.error(error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';

  console.log('🔧 MaaS MVP Database Migration Runner');
  console.log('=====================================');

  try {
    // Test connection first
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    if (mode === 'all' || mode === 'schema') {
      await runSqlFile(SCHEMA_FILE);
    }

    if (mode === 'all' || mode === 'seeds') {
      await runSqlFile(SEEDS_FILE);
    }

    console.log('\n✅ Migration complete!');
    console.log('\n📋 Verification queries:');
    console.log('   SELECT COUNT(*) FROM pipeline_runs;');
    console.log('   SELECT COUNT(*) FROM system_prompts;');
    console.log('   SELECT COUNT(*) FROM test_dialogs;');
    console.log('   SELECT COUNT(*) FROM lsm_storage;');

    // Run verification
    console.log('\n🔍 Running verification...');
    const tables = ['pipeline_runs', 'lsm_storage', 'system_prompts', 'raw_logs', 'test_dialogs', 'test_runs'];

    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} rows`);
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
