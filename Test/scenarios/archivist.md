# Test Scenario: Archivist (Step 9)

**Модуль:** `src/agents/index.ts` → `runArchivist()` (TBD)
**Шаг:** 9
**Тесты:** T9.1, T9.2, T9.3, T9.4

> **Статус:** ⏳ НЕ РЕАЛИЗОВАН

---

## Описание

Archivist — агент, который создаёт долгосрочную память (LSM) из завершённых диалогов.

### Задача:
1. Читать raw_logs после COMPLETED
2. Суммаризировать диалог через LLM
3. Извлечь semantic_tags
4. Записать в lsm_storage

---

## T9.1 — Чтение raw_logs для архивации (⏳)

### Логика:
```typescript
// Получить логи для конкретного pipeline_run
const logs = await pool.query(
  `SELECT log_type, log_data
   FROM raw_logs
   WHERE pipeline_run_id = $1
   ORDER BY created_at`,
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

---

## T9.2 — Суммаризация через LLM (⏳)

### Промпт:
```
Summarize this conversation in 1-2 sentences, focusing on key facts and user preferences:

User: {query}
Assistant: {answer}

Summary:
```

### Код (план):
```typescript
const summary = await createChatCompletion({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a summarizer...' },
    { role: 'user', content: dialogText }
  ],
  max_tokens: 200
});
```

---

## T9.3 — Извлечение semantic_tags (⏳)

### Промпт:
```
Extract 3-5 keywords/tags from this conversation:

{dialog}

Tags (comma-separated):
```

### Ожидаемый результат:
```json
["programming", "typescript", "preference", "blue"]
```

---

## T9.4 — Запись в lsm_storage (⏳)

### SQL:
```sql
INSERT INTO lsm_storage (
  user_id,
  summary_text,
  semantic_tags,
  time_bucket,
  source_run_ids
) VALUES ($1, $2, $3, $4, $5)
```

### Поля:
- `summary_text` — суммаризация от LLM
- `semantic_tags` — массив keywords
- `time_bucket` — неделя (например '2025-W47')
- `source_run_ids` — массив pipeline_run IDs

---

## Триггер запуска

### Вариант 1: После COMPLETED
```typescript
case 'COMPLETED':
  await runArchivist(id);
  break;
```

### Вариант 2: По расписанию (batch)
```typescript
// Cron job каждый час
const unarchived = await pool.query(
  `SELECT DISTINCT pipeline_run_id FROM raw_logs
   WHERE archived = false`
);
for (const run of unarchived.rows) {
  await runArchivist(run.pipeline_run_id);
}
```

---

## Критерии успеха

1. ✅ После COMPLETED в lsm_storage появляется новая запись
2. ✅ summary_text осмысленно описывает диалог
3. ✅ semantic_tags релевантны содержанию
4. ✅ time_bucket корректный (текущая неделя)

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T9.1 | ⏳ PENDING | - |
| T9.2 | ⏳ PENDING | - |
| T9.3 | ⏳ PENDING | - |
| T9.4 | ⏳ PENDING | - |

---

*Этот сценарий будет обновлён после реализации Archivist*
