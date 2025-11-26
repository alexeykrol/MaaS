# Test Scenario: Logger (Step 5)

**Модуль:** `src/utils/logger.ts`
**Шаг:** 5
**Тесты:** T5.1, T5.2

---

## T5.1 — Все уровни логирования

### Уровни:
- `logger.info()` — информационные сообщения
- `logger.warn()` — предупреждения
- `logger.error()` — ошибки
- `logger.debug()` — отладка (только в development)

### Тест:
```typescript
import { logger } from './utils/logger';

logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
logger.debug('Debug message'); // только если DEBUG=true
```

### Ожидаемый результат:
```
[2025-11-25T12:00:00.000Z] [INFO] Info message
[2025-11-25T12:00:00.000Z] [WARN] Warning message
[2025-11-25T12:00:00.000Z] [ERROR] Error message
[2025-11-25T12:00:00.000Z] [DEBUG] Debug message
```

---

## T5.2 — JSON форматирование объектов

### Тест:
```typescript
logger.info('User data:', { id: '123', name: 'John' });
```

### Ожидаемый результат:
```
[2025-11-25T12:00:00.000Z] [INFO] User data: {
  "id": "123",
  "name": "John"
}
```

### Код:
```typescript
if (typeof data === 'object') {
  return `${prefix} ${message} ${JSON.stringify(data, null, 2)}`;
}
```

---

## Проверка в продакшене

При запуске Orchestrator или сервера в логах должны быть:
- Timestamps в ISO формате
- Уровень в квадратных скобках
- Читаемое форматирование

### Пример реального лога:
```
[2025-11-25T15:30:00.000Z] [INFO] 📡 [Orchestrator] Listening for pipeline events...
[2025-11-25T15:30:00.000Z] [INFO] ✅ [Orchestrator] Started successfully
[2025-11-25T15:30:05.000Z] [INFO] 🔔 [Orchestrator] Event received: {
  "id": "abc-123",
  "status": "NEW",
  "operation": "INSERT"
}
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T5.1 | ✅ PASSED | 2025-11-25 |
| T5.2 | ✅ PASSED | 2025-11-25 |
