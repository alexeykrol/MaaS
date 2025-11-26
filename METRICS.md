# METRICS — метрики системы MaaS

## 0. Определение метрики

> **Метрика** — это числовое значение, которое:
> 1. Вычисляется из конкретных данных в системе (таблицы, логи, timestamps)
> 2. Имеет формулу расчёта
> 3. Имеет target (целевое значение) или threshold (порог срабатывания)

Если нельзя указать: откуда берём данные → как вычисляем → какой target, — это не метрика.

**Исключение:** диагностические метрики могут не иметь target, но обязаны иметь источник данных и формулу.

---

## 1. Список метрик по приоритету

**Primary (цели оптимизации):**
1. Retrieval Precision
2. Retrieval Recall
3. Context Utilization
4. Hallucination Rate

**Secondary (constraints):**
5. Latency P50/P95
6. Token Cost
7. Error Rate

**Diagnostic (понимание системы, без target):**
8. Hit Rate
9. Memory Age at Retrieval

---

## 1.1. Вспомогательные артефакты

Метрики зависят от следующих артефактов, которые должны существовать:

| Артефакт | Тип | Путь/Расположение | Назначение |
|----------|-----|-------------------|------------|
| `telemetry_events` | Таблица БД | `db/schema.sql` | Хранение всех метрик |
| `pipeline_runs` | Таблица БД | `db/schema.sql` | Статусы и timestamps |
| `test_dialogs` | Таблица БД | `db/schema.sql` | Golden dataset для recall |
| LLM-judge промпты | Файл/секция | `SELFLEARN.md`, секция "LLM-Judge Prompts" | Оценка качества |

---

## 2. Описание метрик

### Шаблон описания

Каждая метрика ниже описана по единому шаблону:

1. **Тип:** Primary / Secondary / Diagnostic
2. **Артефакт данных:** таблица и поля, где хранится значение
3. **Артефакт логики:** файл/модуль, который записывает данные
4. **Формула:** SQL-запрос для вычисления
5. **Target:** целевое значение (или "—" для диагностических)
6. **Симптомы проблемы:** как проявляется в поведении системы
7. **Связанные импакт-факторы:** что менять для улучшения (ссылка на IMPACTS.md)
8. **Команды для агента:** конкретные действия

---

### 2.1. Retrieval Precision

**Тип:** Primary

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поле: `retrieval_relevant` (boolean)

**Артефакт логики:**
- Модуль LLM-judge: `[NEW] src/utils/llmJudge.ts`
- Вызывается после Assembler, записывает результат в `telemetry_events`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE retrieval_relevant = true) * 100.0 /
  COUNT(*) FILTER (WHERE memories_found > 0)
FROM telemetry_events
WHERE created_at > NOW() - INTERVAL '1 day';
```

**Target:** > 80%

**Симптомы проблемы:**
- Ответы содержат нерелевантную информацию о пользователе
- LLM упоминает факты, не относящиеся к вопросу

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 4: `top_k` — уменьшить для повышения precision
- Секция 1: `Retrieval Strategy` — добавить reranker

**Команды для агента:**
1. Артефакт данных: «Добавь поле `retrieval_relevant BOOLEAN` в таблицу `telemetry_events`.»
2. Артефакт логики: «Создай `src/utils/llmJudge.ts` с функцией `judgeRetrievalRelevance(query, memories)`. Используй промпт из SELFLEARN.md секция "LLM-Judge Prompts".»
3. Связка: «После Assembler вызови `judgeRetrievalRelevance()` и запиши результат в `telemetry_events`.»

---

### 2.2. Retrieval Recall

**Тип:** Primary

**Артефакт данных:**
- Таблица: `test_dialogs` (Golden dataset)
  - Поле: `expected_memory_ids UUID[]` — какие memories должны быть найдены
- Таблица: `[NEW] test_evaluation_results`
  - Поля: `test_id`, `found_relevant INT`, `expected_relevant INT`

**Артефакт логики:**
- Модуль: `[NEW] src/test-runner/evaluator.ts`
- Запускается в macro-cycle, сравнивает найденные memories с expected

**Формула:**
```sql
SELECT
  AVG(found_relevant::float / expected_relevant::float) * 100
FROM test_evaluation_results
WHERE created_at > NOW() - INTERVAL '1 day';
```

**Target:** > 70%

**Симптомы проблемы:**
- «Он меня не помнит» — пользователь знает, что говорил X, но система не нашла
- Ответы слишком общие, без персонализации

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 4: `top_k` — увеличить для повышения recall
- Секция 2: `Keyword Extraction` — улучшить извлечение ключей
- Секция 3: `Archivist Tagging` — улучшить теги при записи

**Команды для агента:**
1. Артефакт данных: «Добавь поле `expected_memory_ids UUID[]` в таблицу `test_dialogs`.»
2. Артефакт данных: «Создай таблицу `test_evaluation_results (id, test_id, found_relevant, expected_relevant, created_at)`.»
3. Артефакт логики: «Создай `src/test-runner/evaluator.ts` с функцией `evaluateRecall(testDialog)` — сравнивает найденные memories с expected_memory_ids.»

---

### 2.3. Context Utilization

**Тип:** Primary

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поле: `context_utilized` (boolean)

**Артефакт логики:**
- Модуль LLM-judge: `[NEW] src/utils/llmJudge.ts`
- Функция: `judgeContextUtilization(context, query, response)`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE context_utilized = true) * 100.0 /
  COUNT(*) FILTER (WHERE memories_found > 0)
FROM telemetry_events;
```

**Target:** > 90%

**Симптомы проблемы:**
- LLM игнорирует поднятый контекст
- Ответы не отличаются от ответов без памяти

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 5: `Responder System Prompt` — усилить инструкцию использовать контекст
- Секция 8: `Max Context Tokens` — проверить, что контекст не обрезается

**Команды для агента:**
1. Артефакт данных: «Добавь поле `context_utilized BOOLEAN` в `telemetry_events`.»
2. Артефакт логики: «В `src/utils/llmJudge.ts` добавь функцию `judgeContextUtilization(context, query, response)`. Промпт из SELFLEARN.md.»
3. Импакт-фактор: «В `responder_system_prompt` (секция 5 IMPACTS.md) добавь правило: ВСЕГДА опираться на CONTEXT при ответе о пользователе.»

---

### 2.4. Hallucination Rate

**Тип:** Primary

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поле: `hallucination_detected` (boolean)

**Артефакт логики:**
- Модуль LLM-judge: `[NEW] src/utils/llmJudge.ts`
- Функция: `detectHallucination(context, response)`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE hallucination_detected = true) * 100.0 /
  COUNT(*)
FROM telemetry_events;
```

**Target:** < 5%

**Симптомы проблемы:**
- «Он приписывает мне то, чего я не говорил»
- Выдуманные факты о предпочтениях пользователя

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 5: `Responder System Prompt` — добавить запрет на выдумывание
- Секция 9: `Temperature` — снизить для уменьшения креативности

**Команды для агента:**
1. Артефакт данных: «Добавь поле `hallucination_detected BOOLEAN` в `telemetry_events`.»
2. Артефакт логики: «В `src/utils/llmJudge.ts` добавь `detectHallucination(context, response)`. Промпт из SELFLEARN.md секция "Hallucination Detection Judge".»
3. Импакт-фактор: «В `responder_system_prompt` добавь: НИКОГДА не утверждать факты о пользователе, которых нет в CONTEXT.»

---

### 2.5. Latency P50/P95

**Тип:** Secondary

**Артефакт данных:**
- Таблица: `pipeline_runs`
- Поля: `created_at`, `updated_at` (уже существуют)

**Артефакт логики:**
- Существующий pipeline автоматически записывает timestamps
- Дополнительно: `[NEW] telemetry_events.latency_ms` для per-stage timing

**Формула:**
```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000
  ) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY
    EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000
  ) AS p95_ms
FROM pipeline_runs
WHERE status = 'COMPLETED'
  AND created_at > NOW() - INTERVAL '1 hour';
```

**Target:** P50 < 2000ms, P95 < 5000ms

**Симптомы проблемы:**
- Долгое ожидание ответа
- Таймауты на клиенте

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 6: `LLM Model` — использовать mini для простых запросов
- Секция 8: `Max Context Tokens` — уменьшить размер контекста

**Команды для агента:**
1. Артефакт данных: «Добавь поля `stage VARCHAR(50)`, `latency_ms INTEGER` в `telemetry_events`.»
2. Артефакт логики: «В каждом агенте (`analyzer.ts`, `assembler.ts`, `finalResponder.ts`) замеряй время выполнения и записывай в `telemetry_events`.»

---

### 2.6. Token Cost

**Тип:** Secondary

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поля: `prompt_tokens INT`, `completion_tokens INT`, `total_cost_usd NUMERIC(10,6)`

**Артефакт логики:**
- Модуль: `src/utils/openai.ts`
- После каждого вызова OpenAI записывать usage в телеметрию

**Формула:**
```sql
SELECT
  AVG(total_cost_usd) AS avg_cost_per_request,
  SUM(total_cost_usd) AS total_daily_cost
FROM telemetry_events
WHERE created_at > NOW() - INTERVAL '1 day';
```

**Target:** < $0.01 per request

**Симптомы проблемы:**
- Неожиданно высокие счета от OpenAI
- Рост стоимости без роста качества

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 6: `LLM Model` — mini вместо 4o для простых запросов
- Секция 8: `Max Context Tokens` — ограничить размер контекста

**Команды для агента:**
1. Артефакт данных: «Добавь поля `prompt_tokens`, `completion_tokens`, `total_cost_usd` в `telemetry_events`.»
2. Артефакт логики: «В `src/utils/openai.ts` после вызова извлеки `response.usage` и вычисли cost: `prompt_tokens * 0.15/1M + completion_tokens * 0.60/1M` для mini.»

---

### 2.7. Error Rate

**Тип:** Secondary

**Артефакт данных:**
- Таблица: `pipeline_runs`
- Поле: `status` (уже существует)

**Артефакт логики:**
- Существующий Orchestrator автоматически помечает FAILED

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'FAILED') * 100.0 / COUNT(*)
FROM pipeline_runs
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Target:** < 1%

**Симптомы проблемы:**
- Пользователи видят ошибки
- Запросы не обрабатываются

**Связанные импакт-факторы (см. IMPACTS.md):**
- Retry logic: `src/orchestrator/index.ts`, функция `withRetry()`

**Команды для агента:**
1. Диагностика: «Выполни `SELECT id, error_message, created_at FROM pipeline_runs WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 10`. Найди паттерн ошибок.»
2. Исправление: «По error_message определи проблемный агент и исправь.»

---

### 2.8. Hit Rate

**Тип:** Diagnostic (без жёсткого target)

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поле: `memories_found INTEGER`

**Артефакт логики:**
- Модуль: `src/agents/assembler.ts`
- После retrieval записывает количество найденных memories

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE memories_found > 0) * 100.0 / COUNT(*)
FROM telemetry_events;
```

**Target:** — (диагностическая, ориентир > 80% для персональных вопросов)

**Симптомы проблемы:**
- Низкий hit rate при наличии релевантной памяти = проблема retrieval
- Высокий hit rate при плохом precision = поднимается мусор

**Команды для агента:**
1. Артефакт данных: «Добавь поле `memories_found INTEGER` в `telemetry_events`.»
2. Артефакт логики: «В `src/agents/assembler.ts` после retrieval запиши `memories.length` в телеметрию.»

---

### 2.9. Memory Age at Retrieval

**Тип:** Diagnostic (без target)

**Артефакт данных:**
- Таблица: `telemetry_events`
- Поле: `avg_memory_age_days NUMERIC`

**Артефакт логики:**
- Модуль: `src/agents/assembler.ts`
- При retrieval вычисляет средний возраст найденных memories

**Формула:**
```sql
SELECT AVG(avg_memory_age_days)
FROM telemetry_events
WHERE memories_found > 0;
```

**Target:** — (диагностическая, используется для анализа)

**Симптомы проблемы:**
- Слишком старые memories = система не учитывает свежие данные
- Слишком свежие = игнорируются важные старые факты

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 7: `Relevance/Recency Weights` — баланс свежести и релевантности

**Команды для агента:**
1. Артефакт данных: «Добавь поле `avg_memory_age_days NUMERIC` в `telemetry_events`.»
2. Артефакт логики: «В `src/agents/assembler.ts` вычисли: `AVG(NOW() - memory.created_at)` в днях, запиши в телеметрию.»

---

## 3. Сводка приоритетов

| # | Метрика | Тип | Target | Частота проверки |
|---|---------|-----|--------|------------------|
| 1 | Hallucination Rate | Primary | < 5% | Каждый macro-cycle |
| 2 | Retrieval Precision | Primary | > 80% | Каждый macro-cycle |
| 3 | Retrieval Recall | Primary | > 70% | На golden dataset |
| 4 | Context Utilization | Primary | > 90% | Каждый macro-cycle |
| 5 | Latency P95 | Secondary | < 5s | Continuous |
| 6 | Error Rate | Secondary | < 1% | Continuous |
| 7 | Token Cost | Secondary | < $0.01/req | Daily |
| 8 | Hit Rate | Diagnostic | — | По запросу |
| 9 | Memory Age | Diagnostic | — | По запросу |

---

## 4. Чеклист для реализации телеметрии

**Шаг 1: Создать/обновить таблицу telemetry_events**
- Артефакт: `db/migrations/003_telemetry.sql`
- Команда: «Создай миграцию с полями из SELFLEARN.md секция "Telemetry Storage Schema".»

**Шаг 2: Добавить запись базовых метрик**
- Артефакт: `src/agents/*.ts`
- Команда: «В каждом агенте после выполнения добавь INSERT в `telemetry_events` с: `pipeline_id`, `stage`, `latency_ms`, `memories_found`.»

**Шаг 3: Создать модуль LLM-judge**
- Артефакт: `[NEW] src/utils/llmJudge.ts`
- Команда: «Создай модуль с функциями: `judgeRetrievalRelevance()`, `judgeContextUtilization()`, `detectHallucination()`. Промпты из SELFLEARN.md секция "LLM-Judge Prompts".»

**Шаг 4: Добавить endpoint метрик**
- Артефакт: `[NEW] src/server.ts` endpoint `/api/metrics`
- Команда: «Добавь GET `/api/metrics` который выполняет SQL из секции 2 и возвращает JSON со всеми метриками.»
