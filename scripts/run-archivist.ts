/**
 * Archivist - Automated Summarization Agent
 *
 * Задача: Обработка raw_logs → создание summaries в LSM
 *
 * Алгоритм:
 * 1. Найти необработанные логи (processed = false)
 * 2. Сгруппировать по user_id + time_bucket (неделя)
 * 3. Для каждой группы:
 *    - Объединить диалоги в один текст
 *    - Вызвать OpenAI для саммаризации
 *    - Извлечь semantic_tags
 *    - Сохранить в lsm_storage
 *    - Пометить логи как processed
 */

import { pool } from '../src/utils/db';
import { logger } from '../src/utils/logger';
import { createChatCompletion } from '../src/utils/openai';

interface RawLog {
  id: string;
  pipeline_run_id: string;
  user_id: string;
  log_type: string;
  log_data: { query?: string; answer?: string };
  created_at: Date;
}

interface ConversationGroup {
  user_id: string;
  time_bucket: string;
  conversations: Array<{ query: string; answer: string }>;
  log_ids: string[];
  pipeline_run_ids: string[];
}

/**
 * Main Archivist function
 */
async function runArchivist() {
  try {
    console.log('📚 [Archivist] Starting summarization process...\n');

    // Step 1: Find unprocessed logs
    const unprocessedResult = await pool.query(
      `SELECT id, pipeline_run_id, user_id, log_type, log_data, created_at
       FROM raw_logs
       WHERE processed = false
       ORDER BY user_id, created_at ASC`
    );

    const logs: RawLog[] = unprocessedResult.rows;

    if (logs.length === 0) {
      console.log('✅ No unprocessed logs found. Nothing to archive.\n');
      await pool.end();
      return;
    }

    console.log(`📊 Found ${logs.length} unprocessed log entries`);

    // Step 2: Group logs by user_id and time_bucket
    const groups = groupLogsByUserAndWeek(logs);

    console.log(`📦 Grouped into ${groups.length} conversation groups\n`);

    // Step 3: Process each group
    let processedGroups = 0;
    let createdSummaries = 0;

    for (const group of groups) {
      console.log('─'.repeat(80));
      console.log(`📝 Processing group: ${group.user_id} / ${group.time_bucket}`);
      console.log(`   Conversations: ${group.conversations.length}`);
      console.log(`   Logs to process: ${group.log_ids.length}`);

      // Create summary using OpenAI
      const summary = await createSummary(group);
      console.log(`   ✅ Summary created: ${summary.summary_text.substring(0, 80)}...`);
      console.log(`   🏷️  Tags: ${summary.semantic_tags.join(', ')}`);

      // Save to LSM
      const lsmResult = await pool.query(
        `INSERT INTO lsm_storage (user_id, time_bucket, semantic_tags, summary_text, source_run_ids)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          group.user_id,
          group.time_bucket,
          summary.semantic_tags,
          summary.summary_text,
          group.pipeline_run_ids
        ]
      );

      console.log(`   💾 Saved to LSM: ${lsmResult.rows[0].id}`);

      // Mark logs as processed
      await pool.query(
        `UPDATE raw_logs
         SET processed = true, processed_at = NOW()
         WHERE id = ANY($1)`,
        [group.log_ids]
      );

      console.log(`   ✅ Marked ${group.log_ids.length} logs as processed\n`);

      processedGroups++;
      createdSummaries++;
    }

    console.log('═'.repeat(80));
    console.log(`✅ [Archivist] Completed!`);
    console.log(`   Processed groups: ${processedGroups}`);
    console.log(`   Created summaries: ${createdSummaries}`);
    console.log(`   Processed logs: ${logs.length}`);
    console.log('═'.repeat(80) + '\n');

    await pool.end();
  } catch (error) {
    logger.error('[Archivist] Error:', error);
    await pool.end();
    process.exit(1);
  }
}

/**
 * Group logs by user_id and time_bucket (weekly)
 */
function groupLogsByUserAndWeek(logs: RawLog[]): ConversationGroup[] {
  const groupMap = new Map<string, ConversationGroup>();

  for (let i = 0; i < logs.length; i += 2) {
    const queryLog = logs[i];
    const answerLog = logs[i + 1];

    // Skip if not a complete pair
    if (!queryLog || !answerLog) continue;
    if (queryLog.log_type !== 'USER_QUERY' || answerLog.log_type !== 'SYSTEM_RESPONSE') continue;

    // Calculate time_bucket (week)
    const date = new Date(queryLog.created_at);
    const timeBucket = getWeekBucket(date);

    // Group key: user_id + time_bucket
    const key = `${queryLog.user_id}:${timeBucket}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        user_id: queryLog.user_id,
        time_bucket: timeBucket,
        conversations: [],
        log_ids: [],
        pipeline_run_ids: []
      });
    }

    const group = groupMap.get(key)!;
    group.conversations.push({
      query: queryLog.log_data.query || '',
      answer: answerLog.log_data.answer || ''
    });
    group.log_ids.push(queryLog.id, answerLog.id);
    if (!group.pipeline_run_ids.includes(queryLog.pipeline_run_id)) {
      group.pipeline_run_ids.push(queryLog.pipeline_run_id);
    }
  }

  return Array.from(groupMap.values());
}

/**
 * Get week bucket in format YYYY-Www
 */
function getWeekBucket(date: Date): string {
  const year = date.getFullYear();
  const weekNumber = getWeekNumber(date);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Create summary using OpenAI
 */
async function createSummary(group: ConversationGroup): Promise<{
  summary_text: string;
  semantic_tags: string[];
}> {
  // Build conversation text
  const conversationText = group.conversations
    .map(c => `User: ${c.query}\nAssistant: ${c.answer}`)
    .join('\n\n');

  // Prompt for summarization
  const prompt = `You are an AI assistant that creates concise summaries of conversation histories.

Below is a conversation history between a user and an AI assistant. Your task is to:
1. Create a concise summary (1-3 sentences) capturing the main topics and user interests
2. Extract 5-10 semantic tags (keywords) that represent the conversation themes

Conversation:
${conversationText}

Please respond in the following JSON format:
{
  "summary": "Your concise summary here",
  "tags": ["tag1", "tag2", "tag3", ...]
}`;

  console.log(`   🤖 Calling OpenAI for summarization...`);

  const response = await createChatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates concise summaries. Always respond with valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3, // Lower temperature for more consistent summarization
    max_tokens: 500
  });

  // Parse JSON response
  try {
    const parsed = JSON.parse(response);
    return {
      summary_text: parsed.summary,
      semantic_tags: parsed.tags
    };
  } catch (error) {
    // Fallback if JSON parsing fails
    console.warn('   ⚠️  Failed to parse JSON, using fallback extraction');
    return {
      summary_text: response.substring(0, 200),
      semantic_tags: extractTagsFallback(conversationText)
    };
  }
}

/**
 * Fallback tag extraction if OpenAI response is not JSON
 */
function extractTagsFallback(text: string): string[] {
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'when', 'where', 'why', 'to', 'for', 'of', 'in', 'on', 'at', 'you', 'your', 'can', 'could', 'would', 'should'];

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w));

  // Count frequency
  const freq: { [key: string]: number } = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);

  // Get top 10
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(e => e[0]);
}

// Run the archivist
runArchivist();
