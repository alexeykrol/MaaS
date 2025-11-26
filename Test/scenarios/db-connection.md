# Test Scenario: DB Connection (Step 0)

**Модуль:** `src/utils/db.ts`
**Шаг:** 0
**Тесты:** T0.1, T0.2, T0.3

---

## T0.1 — Подключение к Supabase

### Предусловия:
- `.env` содержит валидный `DATABASE_URL`
- Supabase проект активен

### Шаги:
1. Запустить `npm run db:test`
2. Проверить вывод в консоли

### Ожидаемый результат:
```
✅ Database connection successful!
PostgreSQL version: PostgreSQL 15.x ...
```

### Команда:
```bash
npm run db:test
```

---

## T0.2 — SSL соединение работает

### Предусловия:
- DATABASE_URL указывает на Supabase (требует SSL)

### Шаги:
1. Проверить что в `db.ts` есть `ssl: { rejectUnauthorized: false }`
2. Запустить `npm run db:test`

### Ожидаемый результат:
- Соединение успешно (без SSL ошибок)

### Проверка кода:
```typescript
// src/utils/db.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
```

---

## T0.3 — Pool создаётся корректно

### Предусловия:
- `db.ts` экспортирует `pool`

### Шаги:
1. Импортировать pool в любой модуль
2. Выполнить `pool.query('SELECT 1')`

### Ожидаемый результат:
- Query выполняется без ошибок
- Pool переиспользует соединения

### Пример:
```typescript
import { pool } from './utils/db';
const result = await pool.query('SELECT NOW()');
console.log(result.rows[0]);
```

---

## Статус

| Тест | Статус | Дата |
|------|--------|------|
| T0.1 | ✅ PASSED | 2025-11-25 |
| T0.2 | ✅ PASSED | 2025-11-25 |
| T0.3 | ✅ PASSED | 2025-11-25 |
