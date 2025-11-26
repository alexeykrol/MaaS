# Test Scenario: Analyzer (Step 6)

**Модуль:** `src/agents/index.ts` → `runAnalyzer()`
**Шаг:** 6
**Тесты:** T6.1, T6.2, T6.3, T6.4

---

## T6.1 — Извлечение keywords из query

### Логика:
```typescript
function extractSimpleKeywords(query: string): string[] {
  const stopWords = ['the', 'a', 'an', 'is', 'are', ...];
  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));
  return [...new Set(words)];
}
```

### Тест:
| Input | Expected Output |
|-------|-----------------|
| "What is my favorite color?" | ["favorite", "color"] |
| "Tell me about TypeScript" | ["tell", "typescript"] |
| "How are you doing today?" | ["doing", "today"] |

### Проверка в логах:
```
[INFO] [Analyzer] Extracted keywords: [favorite, color]
```

---

## T6.2 — Поиск в LSM по semantic_tags

### SQL запрос:
```sql
SELECT summary_text, semantic_tags, time_bucket
FROM lsm_storage
WHERE user_id = $1
  AND semantic_tags && $2  -- PostgreSQL array overlap
ORDER BY created_at DESC
LIMIT 3
```

### Тест:
1. Убедиться что в lsm_storage есть записи с semantic_tags
2. Отправить запрос с matching keywords
3. Проверить что memories найдены

### Seeds (db/seeds.sql):
```sql
INSERT INTO lsm_storage (user_id, summary_text, semantic_tags, time_bucket)
VALUES (
  'test-user-id',
  'User prefers blue color and likes programming',
  ARRAY['blue', 'color', 'programming'],
  '2025-W47'
);
```

---

## T6.3 — Возврат до 3 memories

### Код:
```typescript
LIMIT 3
```

### Тест:
1. Добавить 5+ memories в lsm_storage для одного user
2. Отправить запрос
3. Проверить что вернулось максимум 3

### Лог:
```
[INFO] [Analyzer] Found 3 memories from LSM (2 keywords)
```

---

## T6.4 — Сохранение в analysis_result

### Формат analysis_result:
```json
{
  "memories": [
    {
      "summary_text": "User prefers blue color",
      "semantic_tags": ["blue", "color"],
      "time_bucket": "2025-W47"
    }
  ],
  "search_keywords": ["favorite", "color"],
  "timestamp": "2025-11-25T15:00:00.000Z"
}
```

### SQL проверка:
```sql
SELECT analysis_result
FROM pipeline_runs
WHERE id = '{pipeline_id}';
```

### Ожидаемый результат:
- analysis_result содержит JSON с memories
- status изменился на ANALYZED

---

## E2E тест

```bash
# 1. Запустить Orchestrator
npm run orchestrator

# 2. Создать pipeline_run
INSERT INTO pipeline_runs (user_id, status, user_query)
VALUES ('test-user-id', 'NEW', 'What is my favorite color?');

# 3. Проверить результат
SELECT status, analysis_result FROM pipeline_runs WHERE ...;
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T6.1 | ✅ PASSED | 2025-11-25 |
| T6.2 | ✅ PASSED | 2025-11-25 |
| T6.3 | ✅ PASSED | 2025-11-25 |
| T6.4 | ✅ PASSED | 2025-11-25 |
