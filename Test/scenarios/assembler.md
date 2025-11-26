# Test Scenario: Assembler (Step 7)

**Модуль:** `src/agents/index.ts` → `runAssembler()`
**Шаг:** 7
**Тесты:** T7.1, T7.2, T7.3, T7.4

---

## T7.1 — Чтение analysis_result

### Логика:
Assembler читает результат работы Analyzer из колонки `analysis_result`.

### Код:
```typescript
const run = result.rows[0];
const analysis = run.analysis_result || { memories: [] };
```

### Тест:
1. После Analyzer: проверить что analysis_result заполнен
2. Assembler читает memories из analysis_result

### Лог:
```
[INFO] [Assembler] Building context for: "What is my favorite color?..."
```

---

## T7.2 — Получение raw_logs

### Логика:
Получить последние диалоги пользователя из raw_logs для контекста.

### SQL:
```sql
SELECT log_type, log_data, created_at
FROM raw_logs
WHERE user_id = $1
  AND pipeline_run_id != $2  -- исключить текущий
ORDER BY created_at ASC
```

### Формат raw_logs:
```json
// USER_QUERY
{ "query": "Hello", "timestamp": "..." }

// SYSTEM_RESPONSE
{ "answer": "Hi there!", "timestamp": "..." }
```

### Лог:
```
[INFO] [Assembler] Found 2 recent exchanges from raw_logs
```

---

## T7.3 — Формат контекста корректен

### Спецификация контекста (/context/format.md):
```
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory...

PREVIOUS CONTEXT (from long-term memory):
[memories from LSM]

RECENT CONVERSATION:
User: [previous query]
Assistant: [previous answer]

CURRENT QUERY:
[current user query]

Please respond naturally, referencing past context when relevant.
```

### Код:
```typescript
function buildContextString(
  currentQuery: string,
  memories: Array<{ summary_text: string }>,
  recentLogs: Array<{ query: string; answer: string }>
): string
```

### Тест:
1. Создать pipeline с memories и recent logs
2. Проверить final_context_payload

---

## T7.4 — Сохранение в final_context_payload

### SQL:
```sql
UPDATE pipeline_runs
SET
  final_context_payload = $1,
  status = 'READY',
  updated_at = NOW()
WHERE id = $2
```

### Проверка:
```sql
SELECT final_context_payload, status
FROM pipeline_runs
WHERE id = '{pipeline_id}';
```

### Ожидаемый результат:
- final_context_payload содержит собранный контекст
- status = 'READY'

---

## Пример полного контекста

```
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory of past conversations with this user.

PREVIOUS CONTEXT (from long-term memory):
User prefers blue color and likes programming in TypeScript.

RECENT CONVERSATION:
User: Hello, how are you?
Assistant: I'm doing well, thank you for asking!

CURRENT QUERY:
What is my favorite color?

Please respond naturally, referencing past context when relevant.
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T7.1 | ✅ PASSED | 2025-11-25 |
| T7.2 | ✅ PASSED | 2025-11-25 |
| T7.3 | ✅ PASSED | 2025-11-25 |
| T7.4 | ✅ PASSED | 2025-11-25 |
