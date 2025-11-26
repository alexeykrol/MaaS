# Test Scenario: Schema + Seeds (Step 1)

**Модуль:** `db/schema.sql`, `db/seeds.sql`
**Шаг:** 1
**Тесты:** T1.1, T1.2, T1.3, T1.4

---

## T1.1 — Таблица pipeline_runs существует

### Шаги:
1. Подключиться к БД
2. Выполнить запрос

### SQL:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pipeline_runs';
```

### Ожидаемый результат:
- Колонки: id, user_id, status, user_query, analysis_result, final_context_payload, final_answer, error_message, created_at, updated_at

---

## T1.2 — Таблица lsm_storage существует

### SQL:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'lsm_storage';
```

### Ожидаемый результат:
- Колонки: id, user_id, summary_text, semantic_tags, time_bucket, source_run_ids, created_at

---

## T1.3 — Триггер NOTIFY работает

### Шаги:
1. Открыть два терминала
2. Терминал 1: `LISTEN pipeline_events;`
3. Терминал 2: `INSERT INTO pipeline_runs ...`
4. Проверить Терминал 1

### SQL (Терминал 1):
```sql
LISTEN pipeline_events;
```

### SQL (Терминал 2):
```sql
INSERT INTO pipeline_runs (user_id, status, user_query)
VALUES ('test-user-id', 'NEW', 'Test query')
RETURNING id;
```

### Ожидаемый результат (Терминал 1):
```
Asynchronous notification "pipeline_events" received from server process with payload "{"id":"...","status":"NEW","operation":"INSERT"}"
```

---

## T1.4 — Seeds применены (test_dialogs)

### SQL:
```sql
SELECT COUNT(*) FROM test_dialogs;
SELECT COUNT(*) FROM lsm_storage;
```

### Ожидаемый результат:
- test_dialogs: >= 1 записей
- lsm_storage: >= 1 записей (sample memories)

---

## Команды

```bash
# Применить schema
npm run db:schema

# Применить seeds
npm run db:seeds

# Или вместе
npm run db:migrate
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T1.1 | ✅ PASSED | 2025-11-25 |
| T1.2 | ✅ PASSED | 2025-11-25 |
| T1.3 | ✅ PASSED | 2025-11-25 |
| T1.4 | ✅ PASSED | 2025-11-25 |
