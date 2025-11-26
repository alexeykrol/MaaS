# Test Scenario: Test Runner (Step 2)

**Модуль:** `src/test-runner/`
**Шаг:** 2
**Тесты:** T2.1, T2.2, T2.3, T2.4, T2.5

---

## T2.1 — Engine запускается в mock mode

### Предусловия:
- Сервер запущен (`npm run dev`)

### Шаги:
1. Проверить что `TestRunnerEngine` поддерживает mock mode
2. Запустить тест через API

### Код:
```typescript
// src/test-runner/engine.ts
const engine = new TestRunnerEngine({ mockMode: true });
```

### Ожидаемый результат:
- Engine не вызывает реальные агенты
- Возвращает mock ответы

---

## T2.2 — API endpoints работают

### Endpoints:
```
GET  /api/test-runner/dialogs  — список тестовых диалогов
POST /api/test-runner/run      — запуск теста
GET  /api/test-runner/status/:id — статус теста
```

### Тест:
```bash
# Получить диалоги
curl http://localhost:3000/api/test-runner/dialogs

# Запустить тест
curl -X POST http://localhost:3000/api/test-runner/run \
  -H "Content-Type: application/json" \
  -d '{"dialogId": "...", "mockMode": true}'
```

### Ожидаемый результат:
- 200 OK с JSON ответом

---

## T2.3 — Web UI загружается

### Шаги:
1. Открыть http://localhost:3000/test-runner/
2. Проверить что UI отображается

### Ожидаемый результат:
- Terminal-style интерфейс
- Список тестовых диалогов
- Кнопка "Run Test"

---

## T2.4 — Тест создаёт pipeline_run

### Шаги:
1. Запустить тест через UI или API
2. Проверить БД

### SQL:
```sql
SELECT * FROM pipeline_runs
ORDER BY created_at DESC
LIMIT 1;
```

### Ожидаемый результат:
- Новая запись в pipeline_runs
- status = 'NEW' (или следующий)

---

## T2.5 — Mock mode возвращает результат

### Шаги:
1. Запустить тест с `mockMode: true`
2. Дождаться завершения

### Ожидаемый результат:
- status = 'COMPLETED'
- final_answer содержит mock ответ

---

## Команды

```bash
# Запустить сервер
npm run dev

# Открыть UI
open http://localhost:3000/test-runner/
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T2.1 | ✅ PASSED | 2025-11-25 |
| T2.2 | ✅ PASSED | 2025-11-25 |
| T2.3 | ✅ PASSED | 2025-11-25 |
| T2.4 | ✅ PASSED | 2025-11-25 |
| T2.5 | ✅ PASSED | 2025-11-25 |
