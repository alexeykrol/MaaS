/**
 * Agent Implementations
 *
 * ✅ Analyzer - реальный поиск в LSM через keyword matching
 * ✅ Assembler - реальная сборка контекста из LSM + raw_logs
 * ✅ FinalResponder - реальный вызов OpenAI с полным контекстом памяти
 *
 * Все агенты полностью функциональны и протестированы.
 */

import { pool } from '../utils/db';
import { logger } from '../utils/logger';
import { createChatCompletion } from '../utils/openai';

/**
 * Helper: Sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyzer Agent - Memory Retriever
 *
 * Задача: Найти релевантные воспоминания из LSM
 * Статусы: NEW → ANALYZING → ANALYZED
 *
 * Текущая реализация (v0.2):
 * - Извлекает keywords из user_query
 * - Ищет в lsm_storage через semantic_tags && keywords (PostgreSQL array overlap)
 * - Возвращает до 3 релевантных memories
 * - Сохраняет результат в analysis_result
 *
 * TODO v0.3: Vector search для семантического поиска
 */
export async function runAnalyzer(pipelineId: string): Promise<void> {
  logger.info(`[Analyzer] 🔍 Starting for ${pipelineId}`);

  try {
    // Идемпотентный захват задачи
    const result = await pool.query(
      `UPDATE pipeline_runs
       SET status = 'ANALYZING', updated_at = NOW()
       WHERE id = $1 AND status = 'NEW'
       RETURNING *`,
      [pipelineId]
    );

    if (result.rowCount === 0) {
      logger.warn(`[Analyzer] Task ${pipelineId} already taken or invalid status`);
      return;
    }

    const run = result.rows[0];
    logger.info(`[Analyzer] Processing query: "${run.user_query.substring(0, 50)}..."`);

    // Extract keywords from query
    const keywords = extractSimpleKeywords(run.user_query);
    logger.info(`[Analyzer] Extracted keywords: [${keywords.join(', ')}]`);

    // Search LSM for relevant memories (v0.1: keyword-based search)
    // Uses PostgreSQL array overlap operator (&&) to match semantic_tags
    const memoryResult = await pool.query(
      `SELECT summary_text, semantic_tags, time_bucket
       FROM lsm_storage
       WHERE user_id = $1
         AND semantic_tags && $2
       ORDER BY created_at DESC
       LIMIT 3`,
      [run.user_id, keywords]
    );

    const memories = memoryResult.rows.map(row => ({
      summary_text: row.summary_text,
      semantic_tags: row.semantic_tags,
      time_bucket: row.time_bucket
    }));

    logger.info(`[Analyzer] Found ${memories.length} memories from LSM (${keywords.length} keywords)`);

    // Результат анализа (формат для Assembler)
    const analysis = {
      memories,
      search_keywords: keywords,
      timestamp: new Date().toISOString(),
    };

    // Сохранение результата
    await pool.query(
      `UPDATE pipeline_runs
       SET
         analysis_result = $1,
         status = 'ANALYZED',
         updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(analysis), pipelineId]
    );

    logger.info(`[Analyzer] ✅ Completed for ${pipelineId}`);
  } catch (error) {
    logger.error(`[Analyzer] ❌ Error for ${pipelineId}:`, error);
    throw error;
  }
}

/**
 * Extract simple keywords from query (v0.1 - basic implementation)
 *
 * TODO v0.2: Use OpenAI for better extraction
 * TODO v0.3: Use embeddings for semantic search
 */
function extractSimpleKeywords(query: string): string[] {
  // Простая экстракция: убрать стоп-слова, взять уникальные
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'when', 'where', 'why', 'to', 'for', 'of', 'in', 'on', 'at'];

  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));

  return [...new Set(words)]; // Unique words
}

/**
 * Assembler Agent - Context Builder
 *
 * Задача: Сборка контекста для LLM согласно /context/format.md
 * Статусы: ANALYZED → ASSEMBLING → READY
 *
 * Текущая реализация (v0.1):
 * - Читает analysis_result от Analyzer (memories из LSM)
 * - Читает последние 3 диалога из raw_logs
 * - Собирает контекст: SYSTEM ROLE + PREVIOUS CONTEXT (LSM) + RECENT CONVERSATION + CURRENT QUERY
 * - Сохраняет в final_context_payload для FinalResponder
 *
 * TODO v0.2: Умная приоритизация контекста по релевантности
 */
export async function runAssembler(pipelineId: string): Promise<void> {
  logger.info(`[Assembler] 📦 Starting for ${pipelineId}`);

  try {
    // Идемпотентный захват
    const result = await pool.query(
      `UPDATE pipeline_runs
       SET status = 'ASSEMBLING', updated_at = NOW()
       WHERE id = $1 AND status = 'ANALYZED'
       RETURNING *`,
      [pipelineId]
    );

    if (result.rowCount === 0) {
      logger.warn(`[Assembler] Task ${pipelineId} already taken or invalid status`);
      return;
    }

    const run = result.rows[0];
    logger.info(`[Assembler] Building context for: "${run.user_query.substring(0, 50)}..."`);

    // Получить результаты анализа (от Analyzer)
    const analysis = run.analysis_result || { memories: [] };

    // Получить recent conversation из raw_logs
    // Берем последние 2-3 завершенных диалога (query + answer pairs)
    const logsResult = await pool.query(
      `SELECT
         log_type,
         log_data,
         created_at
       FROM raw_logs
       WHERE user_id = $1
         AND pipeline_run_id != $2
       ORDER BY created_at ASC`,
      [run.user_id, pipelineId]
    );

    // Группируем логи в пары query-answer (logs ordered ASC, so query comes before answer)
    const recentLogs: Array<{ query: string; answer: string }> = [];
    for (let i = 0; i < logsResult.rows.length; i += 2) {
      const queryLog = logsResult.rows[i];
      const answerLog = logsResult.rows[i + 1];

      if (queryLog && answerLog && queryLog.log_type === 'USER_QUERY' && answerLog.log_type === 'SYSTEM_RESPONSE') {
        recentLogs.push({
          query: queryLog.log_data.query,
          answer: answerLog.log_data.answer
        });
      }
    }

    // Limit to last 3 exchanges (format.md spec)
    const limitedLogs = recentLogs.slice(-3);

    logger.info(`[Assembler] Found ${limitedLogs.length} recent exchanges from raw_logs`);

    // Собрать контекст согласно /context/format.md
    const context = buildContextString(
      run.user_query,
      analysis.memories || [],
      limitedLogs
    );

    logger.info(`[Assembler] Context built: ${context.length} chars`);

    // Сохранение результата
    await pool.query(
      `UPDATE pipeline_runs
       SET
         final_context_payload = $1,
         status = 'READY',
         updated_at = NOW()
       WHERE id = $2`,
      [context, pipelineId]
    );

    logger.info(`[Assembler] ✅ Completed for ${pipelineId}`);
  } catch (error) {
    logger.error(`[Assembler] ❌ Error for ${pipelineId}:`, error);
    throw error;
  }
}

/**
 * Build context string according to /context/format.md v0.1
 *
 * @param currentQuery - User's current question
 * @param memories - Retrieved memories from LSM (from Analyzer)
 * @param recentLogs - Recent conversation history
 * @returns Formatted context string
 */
function buildContextString(
  currentQuery: string,
  memories: Array<{ summary_text: string }>,
  recentLogs: Array<{ query: string; answer: string }>
): string {
  let context = '';

  // Section 1: SYSTEM ROLE (always included)
  context += `SYSTEM ROLE:\n`;
  context += `You are a helpful AI assistant with long-term memory of past conversations with this user.\n\n`;

  // Section 2: PREVIOUS CONTEXT (from long-term memory) - optional
  if (memories && memories.length > 0) {
    context += `PREVIOUS CONTEXT (from long-term memory):\n`;
    memories.forEach(m => {
      context += `${m.summary_text}\n\n`;
    });
  }

  // Section 3: RECENT CONVERSATION - optional
  if (recentLogs && recentLogs.length > 0) {
    context += `RECENT CONVERSATION:\n`;
    recentLogs.forEach(log => {
      context += `User: ${log.query}\n`;
      context += `Assistant: ${log.answer}\n\n`;
    });
  }

  // Section 4: CURRENT QUERY (always included)
  context += `CURRENT QUERY:\n`;
  context += `${currentQuery}\n\n`;

  // Section 5: INSTRUCTION (always included)
  context += `Please respond naturally, referencing past context when relevant.`;

  return context;
}

/**
 * Final Responder Agent Stub
 *
 * Задача: Генерация финального ответа через LLM
 * Статусы: READY → RESPONDING → COMPLETED
 */
export async function runFinalResponder(pipelineId: string): Promise<void> {
  logger.info(`[FinalResponder] 💬 Starting for ${pipelineId}`);

  try {
    // Идемпотентный захват
    const result = await pool.query(
      `UPDATE pipeline_runs
       SET status = 'RESPONDING', updated_at = NOW()
       WHERE id = $1 AND status = 'READY'
       RETURNING *`,
      [pipelineId]
    );

    if (result.rowCount === 0) {
      logger.warn(`[FinalResponder] Task ${pipelineId} already taken or invalid status`);
      return;
    }

    const run = result.rows[0];
    logger.info(`[FinalResponder] Generating response for: "${run.user_query.substring(0, 50)}..."`);

    // Получаем контекст от Assembler (если есть)
    const contextPayload = run.final_context_payload || run.user_query;

    // Вызов реального OpenAI
    logger.info('[FinalResponder] 🤖 Calling OpenAI...');
    const answer = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant with access to long-term memory. Provide clear, accurate, and contextual responses.'
        },
        {
          role: 'user',
          content: contextPayload
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    logger.info(`[FinalResponder] ✅ OpenAI responded (${answer.length} chars)`);

    // Сохранение результата
    await pool.query(
      `UPDATE pipeline_runs
       SET
         final_answer = $1,
         status = 'COMPLETED',
         updated_at = NOW()
       WHERE id = $2`,
      [answer, pipelineId]
    );

    // Логирование в raw_logs (для будущей обработки Archivist)
    logger.info(`[FinalResponder] 📝 Logging to raw_logs...`);

    // Log 1: USER_QUERY
    await pool.query(
      `INSERT INTO raw_logs (pipeline_run_id, user_id, log_type, log_data)
       VALUES ($1, $2, 'USER_QUERY', $3)`,
      [
        pipelineId,
        run.user_id,
        JSON.stringify({
          query: run.user_query,
          timestamp: new Date().toISOString()
        })
      ]
    );

    // Log 2: SYSTEM_RESPONSE
    await pool.query(
      `INSERT INTO raw_logs (pipeline_run_id, user_id, log_type, log_data)
       VALUES ($1, $2, 'SYSTEM_RESPONSE', $3)`,
      [
        pipelineId,
        run.user_id,
        JSON.stringify({
          answer: answer,
          timestamp: new Date().toISOString()
        })
      ]
    );

    logger.info(`[FinalResponder] ✅ Logged 2 entries to raw_logs`);
    logger.info(`[FinalResponder] ✅ Completed for ${pipelineId}`);
  } catch (error) {
    logger.error(`[FinalResponder] ❌ Error for ${pipelineId}:`, error);
    throw error;
  }
}

/**
 * Archivist Agent - Memory Creator
 *
 * Задача: Создать долгосрочную память (LSM) из завершённых диалогов
 * Триггер: После COMPLETED (или по расписанию для batch processing)
 *
 * Текущая реализация (v1.0):
 * - Читает raw_logs для конкретного pipeline_run
 * - Суммаризирует диалог через LLM
 * - Извлекает semantic_tags через LLM
 * - Записывает в lsm_storage
 * - Помечает raw_logs как processed
 */
export async function runArchivist(pipelineId: string): Promise<void> {
  logger.info(`[Archivist] 📚 Starting for ${pipelineId}`);

  try {
    // 1. Получить данные pipeline_run
    const pipelineResult = await pool.query(
      `SELECT user_id, user_query, final_answer
       FROM pipeline_runs
       WHERE id = $1 AND status = 'COMPLETED'`,
      [pipelineId]
    );

    if (pipelineResult.rowCount === 0) {
      logger.warn(`[Archivist] Pipeline ${pipelineId} not found or not completed`);
      return;
    }

    const pipeline = pipelineResult.rows[0];
    logger.info(`[Archivist] Processing dialog for user ${pipeline.user_id}`);

    // 2. Читать raw_logs для этого pipeline (ещё не обработанные)
    const logsResult = await pool.query(
      `SELECT id, log_type, log_data
       FROM raw_logs
       WHERE pipeline_run_id = $1
         AND processed = false
       ORDER BY created_at ASC`,
      [pipelineId]
    );

    if (logsResult.rowCount === 0) {
      logger.info(`[Archivist] No unprocessed logs for ${pipelineId}`);
      return;
    }

    const logs = logsResult.rows;
    logger.info(`[Archivist] Found ${logs.length} unprocessed logs`);

    // 3. Собрать диалог для суммаризации
    const dialogText = logs.map(log => {
      if (log.log_type === 'USER_QUERY') {
        return `User: ${log.log_data.query}`;
      } else if (log.log_type === 'SYSTEM_RESPONSE') {
        return `Assistant: ${log.log_data.answer}`;
      }
      return '';
    }).filter(Boolean).join('\n\n');

    logger.info(`[Archivist] Dialog text: ${dialogText.length} chars`);

    // 4. Вызвать LLM для суммаризации и извлечения тегов
    logger.info(`[Archivist] 🤖 Calling LLM for summarization...`);

    const archivistPrompt = `You are an archivist. Analyze this conversation and create a memory record.

CONVERSATION:
${dialogText}

Respond in JSON format with exactly these fields:
{
  "summary": "A 1-2 sentence summary of what was discussed, focusing on key facts and user preferences",
  "tags": ["tag1", "tag2", "tag3"] // 3-5 relevant keywords/topics as lowercase strings
}

Important:
- Summary should capture the essence of the conversation
- Tags should be useful for future retrieval (topics, entities, preferences mentioned)
- Keep tags simple and lowercase (e.g., "programming", "preferences", "typescript")`;

    const llmResponse = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: archivistPrompt }
      ],
      temperature: 0.3, // Lower temperature for more consistent JSON
      max_tokens: 500
    });

    logger.info(`[Archivist] LLM responded: ${llmResponse.length} chars`);

    // 5. Парсить JSON ответ
    let archiveData: { summary: string; tags: string[] };
    try {
      // Извлечь JSON из ответа (может быть обёрнут в markdown)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      archiveData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.error(`[Archivist] Failed to parse LLM response:`, llmResponse);
      // Fallback: создать базовую запись
      archiveData = {
        summary: `Dialog about: ${pipeline.user_query.substring(0, 100)}`,
        tags: extractSimpleKeywords(pipeline.user_query)
      };
    }

    logger.info(`[Archivist] Summary: "${archiveData.summary.substring(0, 80)}..."`);
    logger.info(`[Archivist] Tags: [${archiveData.tags.join(', ')}]`);

    // 6. Вычислить time_bucket (ISO week format: 2025-W47)
    const now = new Date();
    const timeBucket = getISOWeek(now);
    logger.info(`[Archivist] Time bucket: ${timeBucket}`);

    // 7. Записать в lsm_storage
    const logIds = logs.map(l => l.id);

    await pool.query(
      `INSERT INTO lsm_storage (user_id, time_bucket, semantic_tags, summary_text, source_run_ids)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        pipeline.user_id,
        timeBucket,
        archiveData.tags,
        archiveData.summary,
        [pipelineId] // source_run_ids - массив UUID
      ]
    );

    logger.info(`[Archivist] ✅ Created LSM record`);

    // 8. Пометить raw_logs как обработанные
    await pool.query(
      `UPDATE raw_logs
       SET processed = true, processed_at = NOW()
       WHERE id = ANY($1)`,
      [logIds]
    );

    logger.info(`[Archivist] ✅ Marked ${logIds.length} logs as processed`);
    logger.info(`[Archivist] ✅ Completed for ${pipelineId}`);

  } catch (error) {
    logger.error(`[Archivist] ❌ Error for ${pipelineId}:`, error);
    throw error;
  }
}

/**
 * Get ISO week string (e.g., "2025-W47")
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}
