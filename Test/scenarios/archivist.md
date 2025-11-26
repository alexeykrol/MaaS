# Test Scenario: Archivist (Step 9)

**Модуль:** `src/agents/index.ts` → `runArchivist()`
**Шаг:** 9
**Тесты:** T9.1, T9.2, T9.3, T9.4

> **Статус:** ✅ РЕАЛИЗОВАН И ПРОТЕСТИРОВАН

---

## Описание

Archivist — агент, который создаёт долгосрочную память (LSM) из завершённых диалогов.

### Задача:
1. Вызывается после COMPLETED через Orchestrator
2. Читает raw_logs для pipeline_run
3. Суммаризирует диалог через LLM
4. Извлекает semantic_tags через LLM
5. Записывает summary в lsm_storage
6. Помечает raw_logs как processed

---

## T9.1 — Чтение raw_logs для архивации ✅

### Код:
```typescript
const logsResult = await pool.query(
  `SELECT id, log_type, log_data
   FROM raw_logs
   WHERE pipeline_run_id = $1
     AND processed = false
   ORDER BY created_at ASC`,
  [pipelineId]
);
```

### Ожидаемые данные:
```json
[
  { "log_type": "USER_QUERY", "log_data": { "query": "..." } },
  { "log_type": "SYSTEM_RESPONSE", "log_data": { "answer": "..." } }
]
```

### Лог:
```
[INFO] [Archivist] Found 2 unprocessed logs
[INFO] [Archivist] Dialog text: 745 chars
```

---

## T9.2 — Суммаризация через LLM ✅

### Промпт:
```
You are an archivist. Analyze this conversation and create a memory record.

CONVERSATION:
User: [query]
Assistant: [answer]

Respond in JSON format with exactly these fields:
{
  "summary": "A 1-2 sentence summary...",
  "tags": ["tag1", "tag2", "tag3"]
}
```

### Код:
```typescript
const llmResponse = await createChatCompletion({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: archivistPrompt }],
  temperature: 0.3,
  max_tokens: 500
});
```

### Реальный результат:
```
[INFO] [Archivist] 🤖 Calling LLM for summarization...
[INFO] [OpenAI] Completed in 3522ms
[INFO] [Archivist] LLM responded: 378 chars
```

---

## T9.3 — Извлечение semantic_tags ✅

### Ожидаемый формат:
```json
["tag1", "tag2", "tag3", "tag4", "tag5"]
```

### Реальный результат:
```
[INFO] [Archivist] Tags: [meaning of life, philosophy, personal growth, existentialism, connections]
```

### Fallback при ошибке парсинга:
```typescript
archiveData = {
  summary: `Dialog about: ${pipeline.user_query.substring(0, 100)}`,
  tags: extractSimpleKeywords(pipeline.user_query)
};
```

---

## T9.4 — Запись в lsm_storage ✅

### SQL:
```sql
INSERT INTO lsm_storage (user_id, time_bucket, semantic_tags, summary_text, source_run_ids)
VALUES ($1, $2, $3, $4, $5)
```

### Поля:
- `user_id` — UUID пользователя
- `time_bucket` — ISO week (например '2025-W48')
- `semantic_tags` — массив тегов от LLM
- `summary_text` — суммаризация от LLM
- `source_run_ids` — массив UUID pipeline_runs

### Реальный результат:
```
[INFO] [Archivist] Time bucket: 2025-W48
[INFO] [Archivist] ✅ Created LSM record
```

### Проверка в БД:
```sql
SELECT semantic_tags, summary_text
FROM lsm_storage
ORDER BY created_at DESC
LIMIT 1;
```

---

## T9.5 — Пометка raw_logs как processed ✅

### SQL:
```sql
UPDATE raw_logs
SET processed = true, processed_at = NOW()
WHERE id = ANY($1)
```

### Реальный результат:
```
[INFO] [Archivist] ✅ Marked 2 logs as processed
```

---

## E2E тест

```bash
# 1. Запустить Orchestrator (с Archivist routing)
npm run orchestrator

# 2. Создать pipeline_run
npx ts-node src/test-pipeline.ts

# 3. Наблюдать логи:
# - Pipeline: NEW → COMPLETED
# - Archivist: reads logs → summarizes → saves to LSM

# 4. Проверить результат в БД
SELECT * FROM lsm_storage ORDER BY created_at DESC LIMIT 1;
SELECT processed, COUNT(*) FROM raw_logs GROUP BY processed;
```

---

## Триггер запуска

Archivist вызывается автоматически в Orchestrator:

```typescript
case 'COMPLETED':
  logger.info(`✅ [Orchestrator] Request completed: ${id}`);
  logger.info(`➡️  [Orchestrator] Routing to Archivist: ${id}`);
  await runArchivist(id);
  break;
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T9.1 | ✅ PASSED | 2025-11-26 |
| T9.2 | ✅ PASSED | 2025-11-26 |
| T9.3 | ✅ PASSED | 2025-11-26 |
| T9.4 | ✅ PASSED | 2025-11-26 |

---

*Step 9 завершён успешно!*
