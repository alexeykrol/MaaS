#!/usr/bin/env ts-node

/**
 * Simple script to test Supabase connection
 * Run: npm run dev src/test-connection.ts
 */

import { testConnection, closePool } from './utils/db';

async function main() {
  console.log('🔌 Testing Supabase PostgreSQL connection...\n');

  const isConnected = await testConnection();

  if (isConnected) {
    console.log('\n✅ Step 0: Project preparation complete!');
    console.log('   - Project structure created');
    console.log('   - Dependencies installed');
    console.log('   - Supabase connection verified');
    console.log('\n📋 Next: Step 1 - Create database schema');
  } else {
    console.log('\n❌ Connection failed. Please check:');
    console.log('   1. .env file exists (copy from .env.example)');
    console.log('   2. DATABASE_URL is correct');
    console.log('   3. Supabase project is running');
  }

  await closePool();
  process.exit(isConnected ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
