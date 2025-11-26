# Test Scenario: FinalResponder (Step 8)

**Модуль:** `src/agents/index.ts` → `runFinalResponder()`
**Шаг:** 8
**Тесты:** T8.1, T8.2, T8.3, T8.4, T8.5

---

## T8.1 — OpenAI API подключение

### Предусловия:
- `OPENAI_API_KEY` в `.env`
- Ключ валидный и имеет credits

### Тест подключения:
```typescript
import { testOpenAIConnection } from './utils/openai';
const ok = await testOpenAIConnection();
```

### Ожидаемый результат:
```
[INFO] [OpenAI] Testing connection...
[INFO] [OpenAI] Calling gpt-4o-mini...
[INFO] [OpenAI] Connection test successful: OK
```

---

## T8.2 — Вызов gpt-4o-mini

### Код:
```typescript
const answer = await createChatCompletion({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant...' },
    { role: 'user', content: contextPayload }
  ],
  temperature: 0.7,
  max_tokens: 2000
});
```

### Лог:
```
[INFO] [FinalResponder] 🤖 Calling OpenAI...
[INFO] [OpenAI] Calling gpt-4o-mini...
[INFO] [OpenAI] Completed in 1234ms {
  "model": "gpt-4o-mini",
  "tokens": 150,
  "prompt_tokens": 100,
  "completion_tokens": 50
}
[INFO] [FinalResponder] ✅ OpenAI responded (256 chars)
```

---

## T8.3 — Сохранение final_answer

### SQL:
```sql
UPDATE pipeline_runs
SET
  final_answer = $1,
  status = 'COMPLETED',
  updated_at = NOW()
WHERE id = $2
```

### Проверка:
```sql
SELECT final_answer, status
FROM pipeline_runs
WHERE id = '{pipeline_id}';
```

### Ожидаемый результат:
- final_answer содержит ответ от LLM
- status = 'COMPLETED'

---

## T8.4 — Логирование в raw_logs

### Код:
```typescript
// Log 1: USER_QUERY
await pool.query(
  `INSERT INTO raw_logs (pipeline_run_id, user_id, log_type, log_data)
   VALUES ($1, $2, 'USER_QUERY', $3)`,
  [pipelineId, run.user_id, JSON.stringify({ query, timestamp })]
);

// Log 2: SYSTEM_RESPONSE
await pool.query(
  `INSERT INTO raw_logs (pipeline_run_id, user_id, log_type, log_data)
   VALUES ($1, $2, 'SYSTEM_RESPONSE', $3)`,
  [pipelineId, run.user_id, JSON.stringify({ answer, timestamp })]
);
```

### SQL проверка:
```sql
SELECT log_type, log_data
FROM raw_logs
WHERE pipeline_run_id = '{pipeline_id}'
ORDER BY created_at;
```

### Ожидаемый результат:
- 2 записи: USER_QUERY и SYSTEM_RESPONSE
- log_data содержит query/answer + timestamp

---

## T8.5 — Статус → COMPLETED

### Flow:
```
READY → RESPONDING → COMPLETED
```

### Проверка:
```sql
SELECT status FROM pipeline_runs WHERE id = '{pipeline_id}';
```

### Лог:
```
[INFO] [FinalResponder] ✅ Completed for {pipeline_id}
[INFO] [Orchestrator] ✅ Request completed: {pipeline_id}
```

---

## E2E тест полного цикла

```bash
# 1. Запустить Orchestrator
npm run orchestrator

# 2. Создать запрос
INSERT INTO pipeline_runs (user_id, status, user_query)
VALUES ('test-user-id', 'NEW', 'What is 2+2?');

# 3. Наблюдать логи:
# - Analyzer extracts keywords
# - Assembler builds context
# - FinalResponder calls OpenAI
# - Status becomes COMPLETED

# 4. Проверить результат
SELECT user_query, final_answer, status
FROM pipeline_runs
ORDER BY created_at DESC
LIMIT 1;
```

---

## Error Handling

### OpenAI ошибки:
```typescript
if (error.status === 401) {
  throw new Error('OpenAI API key is invalid or missing');
} else if (error.status === 429) {
  throw new Error('OpenAI rate limit exceeded');
}
```

### Pipeline ошибки:
- При ошибке → status = 'FAILED'
- error_message содержит описание

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T8.1 | ✅ PASSED | 2025-11-25 |
| T8.2 | ✅ PASSED | 2025-11-25 |
| T8.3 | ✅ PASSED | 2025-11-25 |
| T8.4 | ✅ PASSED | 2025-11-25 |
| T8.5 | ✅ PASSED | 2025-11-25 |
