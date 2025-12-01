/**
 * Seed LSM Storage with Test Data
 *
 * Вставляет тестовые воспоминания о путешествии в Японию
 * для тестирования Analyzer с реальной БД
 */

import { pool } from '../shared/db';

async function seedLSM() {
  try {
    console.log('🌱 Seeding LSM storage with test data...\n');

    // Test user ID (same as used in tests)
    const testUserId = '00000000-0000-0000-0000-000000000001';

    // Current week (format: YYYY-Www)
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = getWeekNumber(now);
    const timeBucket = `${year}-W${String(weekNumber).padStart(2, '0')}`;

    console.log(`📅 Time bucket: ${timeBucket}`);
    console.log(`👤 User ID: ${testUserId}\n`);

    // Test memories (same as mocks from Analyzer)
    const memories = [
      {
        summary_text: "User discussed vacation planning to Japan. Interested in cherry blossoms, budget travel, April-May timeframe.",
        semantic_tags: ['japan', 'vacation', 'travel', 'cherry-blossoms', 'budget', 'april', 'may']
      },
      {
        summary_text: "User mentioned budget constraint of $3000-5000 for 2-week trip. Prefers cultural experiences over luxury hotels.",
        semantic_tags: ['japan', 'budget', 'travel', 'cultural', 'hotels', '3000', '5000']
      },
      {
        summary_text: "User asked about temples and shrines in Kyoto. Showed particular interest in Fushimi Inari and Kinkaku-ji.",
        semantic_tags: ['japan', 'kyoto', 'temples', 'shrines', 'fushimi-inari', 'kinkaku-ji']
      }
    ];

    // Clear existing test data for this user
    const deleteResult = await pool.query(
      'DELETE FROM lsm_storage WHERE user_id = $1',
      [testUserId]
    );

    console.log(`🗑️  Cleared ${deleteResult.rowCount} existing memories for test user\n`);

    // Insert test memories
    let insertedCount = 0;
    for (const memory of memories) {
      const result = await pool.query(
        `INSERT INTO lsm_storage (user_id, time_bucket, semantic_tags, summary_text)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [testUserId, timeBucket, memory.semantic_tags, memory.summary_text]
      );

      insertedCount++;
      console.log(`✅ Inserted memory ${insertedCount}/${memories.length}`);
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Tags: ${memory.semantic_tags.join(', ')}`);
      console.log(`   Text: ${memory.summary_text.substring(0, 60)}...\n`);
    }

    // Verify insertion
    const verifyResult = await pool.query(
      `SELECT COUNT(*) as count FROM lsm_storage WHERE user_id = $1`,
      [testUserId]
    );

    console.log('─'.repeat(80));
    console.log(`✅ Seeding complete! Inserted ${insertedCount} memories`);
    console.log(`✅ Verification: ${verifyResult.rows[0].count} memories found in database`);
    console.log('─'.repeat(80));

    await pool.end();
  } catch (error) {
    console.error('❌ Error seeding LSM:', error);
    await pool.end();
    process.exit(1);
  }
}

/**
 * Get ISO week number
 * https://en.wikipedia.org/wiki/ISO_week_date
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

seedLSM();
