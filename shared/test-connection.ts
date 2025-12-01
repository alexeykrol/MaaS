#!/usr/bin/env ts-node

/**
 * Simple script to test Supabase connection
 * Run: npm run db:test
 */

import { testConnection, closePool } from './db';

async function main() {
  console.log('Testing Supabase PostgreSQL connection...\n');

  const isConnected = await testConnection();

  if (isConnected) {
    console.log('\nConnection successful!');
    console.log('   - Supabase connection verified');
  } else {
    console.log('\nConnection failed. Please check:');
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
