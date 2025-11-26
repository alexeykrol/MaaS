import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// PostgreSQL connection pool (for queries)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
}

// Helper function to get a client from the pool (for transactions)
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log('   Server time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}
