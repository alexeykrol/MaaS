# Test Scenario: Agent Stubs (Step 4)

**Модуль:** `src/agents/index.ts`
**Шаг:** 4
**Тесты:** T4.1, T4.2, T4.3

---

## T4.1 — Идемпотентный захват задачи

### Концепция:
Агент захватывает задачу через `UPDATE WHERE status = X`, что предотвращает race conditions.

### Код:
```typescript
const result = await pool.query(
  `UPDATE pipeline_runs
   SET status = 'ANALYZING', updated_at = NOW()
   WHERE id = $1 AND status = 'NEW'
   RETURNING *`,
  [pipelineId]
);

if (result.rowCount === 0) {
  // Задача уже взята другим процессом
  return;
}
```

### Тест:
1. Создать pipeline_run со статусом NEW
2. Запустить два экземпляра Analyzer одновременно
3. Только один должен захватить задачу

### Ожидаемый результат:
- Один агент: обрабатывает задачу
- Второй агент: `Task already taken or invalid status`

---

## T4.2 — Переход статусов корректен

### State Machine:
```
NEW → ANALYZING → ANALYZED → ASSEMBLING → READY → RESPONDING → COMPLETED
```

### Шаги:
1. Создать pipeline_run
2. Проследить переходы в БД

### SQL мониторинг:
```sql
SELECT id, status, updated_at
FROM pipeline_runs
WHERE id = '{pipeline_id}'
ORDER BY updated_at;
```

### Ожидаемый результат:
- Каждый статус меняется последовательно
- updated_at обновляется при каждом переходе

---

## T4.3 — Ошибка → FAILED статус

### Шаги:
1. Симулировать ошибку в агенте (например, недоступный OpenAI)
2. Проверить что pipeline_run получает статус FAILED

### Код обработки ошибки:
```typescript
try {
  await this.handleEvent(event);
} catch (error) {
  await this.markAsFailed(id, error);
}
```

### SQL проверка:
```sql
SELECT status, error_message
FROM pipeline_runs
WHERE id = '{pipeline_id}';
```

### Ожидаемый результат:
- status = 'FAILED'
- error_message содержит описание ошибки

---

## Команды

```bash
# Запустить полный pipeline
npm run orchestrator

# В другом терминале создать задачу
npm run ts-node src/test-pipeline.ts
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T4.1 | ✅ PASSED | 2025-11-25 |
| T4.2 | ✅ PASSED | 2025-11-25 |
| T4.3 | ✅ PASSED | 2025-11-25 |
