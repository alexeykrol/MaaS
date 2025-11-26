# Test Scenario: Orchestrator (Step 3)

**Модуль:** `src/orchestrator/index.ts`
**Шаг:** 3
**Тесты:** T3.1, T3.2, T3.3, T3.4

---

## T3.1 — LISTEN pipeline_events работает

### Предусловия:
- DATABASE_URL настроен
- Orchestrator запущен

### Шаги:
1. Запустить `npm run orchestrator`
2. Проверить лог

### Ожидаемый результат:
```
[INFO] 📡 [Orchestrator] Listening for pipeline events...
[INFO] ✅ [Orchestrator] Started successfully
```

### Код:
```typescript
await this.client.query('LISTEN pipeline_events');
```

---

## T3.2 — Получение NOTIFY событий

### Шаги:
1. Запустить Orchestrator
2. В отдельном терминале создать pipeline_run
3. Проверить лог Orchestrator

### SQL:
```sql
INSERT INTO pipeline_runs (user_id, status, user_query)
VALUES ('test-user', 'NEW', 'Hello, what is my name?')
RETURNING id;
```

### Ожидаемый результат:
```
[INFO] 🔔 [Orchestrator] Event received: {"id":"...","status":"NEW","operation":"INSERT"}
```

---

## T3.3 — Маршрутизация к агентам

### Логика маршрутизации:
```
NEW       → runAnalyzer()
ANALYZED  → runAssembler()
READY     → runFinalResponder()
COMPLETED → log success
FAILED    → log error
```

### Шаги:
1. INSERT с status='NEW'
2. Проверить что вызван Analyzer
3. После ANALYZED — Assembler
4. После READY — FinalResponder

### Ожидаемый лог:
```
[INFO] ➡️  [Orchestrator] Routing to Analyzer: {id}
[INFO] ➡️  [Orchestrator] Routing to Assembler: {id}
[INFO] ➡️  [Orchestrator] Routing to FinalResponder: {id}
[INFO] ✅ [Orchestrator] Request completed: {id}
```

---

## T3.4 — Reconnect при обрыве

### Шаги:
1. Запустить Orchestrator
2. Прервать соединение (kill connection в Supabase или network drop)
3. Проверить что происходит reconnect

### Ожидаемый результат:
```
[WARN] ⚠️  [Orchestrator] Connection closed unexpectedly
[INFO] 🔄 [Orchestrator] Attempting to reconnect in 5 seconds...
[INFO] ✅ [Orchestrator] Started successfully
```

### Код:
```typescript
private async reconnect() {
  setTimeout(async () => {
    await this.start();
  }, 5000);
}
```

---

## Команды

```bash
# Запустить Orchestrator
npm run orchestrator

# Тестовый INSERT (в psql или через код)
npm run ts-node src/test-notify.ts
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T3.1 | ✅ PASSED | 2025-11-25 |
| T3.2 | ✅ PASSED | 2025-11-25 |
| T3.3 | ✅ PASSED | 2025-11-25 |
| T3.4 | ✅ PASSED | 2025-11-25 |
