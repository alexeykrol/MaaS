# METRICS — метрики системы MaaS

## 0. Определение метрики

> **Метрика** — это числовое значение, которое:
> 1. Вычисляется из конкретных данных в системе (таблицы, логи, timestamps)
> 2. Имеет формулу расчёта
> 3. Имеет target (целевое значение) или threshold (порог срабатывания)

Если нельзя указать: откуда берём данные → как вычисляем → какой target, — это не метрика.

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

**Diagnostic (понимание системы):**
8. Hit Rate
9. Memory Age at Retrieval

---

## 2. Описание метрик

### 2.1. Retrieval Precision

**Артефакт:**
- Таблица: `telemetry_events`
- Поле: `retrieval_relevant` (boolean, от LLM-judge)

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

**Связанные импакт-факторы:**
- `top_k` — уменьшить для повышения precision
- `Retrieval Strategy` — добавить reranker

**Команды для агента:**
- «Найди в `src/agents/assembler.ts` параметр `top_k`. Уменьши его с 3 до 2. Проверь precision через день.»
- «Добавь в `telemetry_events` запись `retrieval_relevant` после каждого запроса с вызовом LLM-judge.»

---

### 2.2. Retrieval Recall

**Артефакт:**
- Таблица: `telemetry_events`
- Golden dataset: `test_dialogs` с полем `expected_memory_ids`

**Формула:**
```sql
-- Для golden dataset тестов
SELECT
  AVG(found_relevant::float / expected_relevant::float) * 100
FROM test_evaluation_results;
```

**Target:** > 70%

**Симптомы проблемы:**
- «Он меня не помнит» — пользователь знает, что говорил X, но система не нашла
- Ответы слишком общие, без персонализации

**Связанные импакт-факторы:**
- `top_k` — увеличить для повышения recall
- `Keyword Extraction` — улучшить извлечение ключей из запроса
- `Archivist Tagging` — улучшить теги при записи

**Команды для агента:**
- «Найди промпт keyword extractor в `src/agents/analyzer.ts`. Добавь правило: всегда извлекать имена технологий, людей, проектов.»
- «Увеличь `top_k` с 2 до 3, проверь recall на golden dataset.»

---

### 2.3. Context Utilization

**Артефакт:**
- Таблица: `telemetry_events`
- Поле: `context_utilized` (boolean, от LLM-judge)

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

**Связанные импакт-факторы:**
- `Responder System Prompt` — усилить инструкцию использовать контекст
- `Max Context Tokens` — проверить, что контекст не обрезается

**Команды для агента:**
- «Найди system prompt в `src/agents/finalResponder.ts`. Добавь явное правило: ВСЕГДА опираться на секцию CONTEXT при ответе о пользователе.»

---

### 2.4. Hallucination Rate

**Артефакт:**
- Таблица: `telemetry_events`
- Поле: `hallucination_detected` (boolean, от LLM-judge)

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

**Связанные импакт-факторы:**
- `Responder System Prompt` — добавить запрет на выдумывание
- `Temperature` — снизить для уменьшения креативности

**Команды для агента:**
- «Найди system prompt в `src/agents/finalResponder.ts`. Добавь правило: НИКОГДА не утверждать факты о пользователе, которых нет в CONTEXT. При отсутствии данных отвечать "нет информации в памяти".»
- «Найди параметр `temperature` в вызове OpenAI. Уменьши с 0.7 до 0.3.»

---

### 2.5. Latency P50/P95

**Артефакт:**
- Таблица: `pipeline_runs`
- Поля: `created_at`, `updated_at`

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

**Связанные импакт-факторы:**
- `LLM Model` — использовать mini для простых запросов
- `Max Context Tokens` — уменьшить размер контекста

**Команды для агента:**
- «Добавь логирование времени каждого этапа (analyzer, assembler, responder) в `telemetry_events`.»
- «Найди, какой этап самый медленный. Оптимизируй его.»

---

### 2.6. Token Cost

**Артефакт:**
- Таблица: `telemetry_events`
- Поля: `prompt_tokens`, `completion_tokens`, `total_cost_usd`

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

**Связанные импакт-факторы:**
- `LLM Model` — mini вместо 4o для простых запросов
- `Max Context Tokens` — ограничить размер контекста

**Команды для агента:**
- «Добавь логирование `prompt_tokens`, `completion_tokens` после каждого вызова OpenAI в `src/utils/openai.ts`.»
- «Вычисли стоимость: prompt_tokens * 0.15/1M + completion_tokens * 0.60/1M для mini.»

---

### 2.7. Error Rate

**Артефакт:**
- Таблица: `pipeline_runs`
- Поле: `status`

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

**Связанные импакт-факторы:**
- Retry logic в `src/orchestrator/index.ts`
- Error handling в агентах

**Команды для агента:**
- «Проверь логи за последний час: `SELECT * FROM pipeline_runs WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 10`. Найди причину.»

---

### 2.8. Hit Rate

**Артефакт:**
- Таблица: `telemetry_events`
- Поле: `hit_rate` (boolean) или `memories_found > 0`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE memories_found > 0) * 100.0 / COUNT(*)
FROM telemetry_events;
```

**Target:** Зависит от типа запросов. Для персональных вопросов > 80%.

**Симптомы проблемы:**
- Низкий hit rate при наличии релевантной памяти = проблема retrieval
- Высокий hit rate при плохом precision = поднимается мусор

**Команды для агента:**
- «Добавь поле `memories_found INTEGER` в `telemetry_events` и записывай количество найденных memories после Assembler.»

---

### 2.9. Memory Age at Retrieval

**Артефакт:**
- Таблица: `telemetry_events`
- Поле: `avg_memory_age_days`

**Формула:**
```sql
SELECT AVG(avg_memory_age_days)
FROM telemetry_events
WHERE memories_found > 0;
```

**Target:** Нет жёсткого target. Диагностическая метрика.

**Симптомы проблемы:**
- Слишком старые memories = система не учитывает свежие данные
- Слишком свежие = игнорируются важные старые факты

**Связанные импакт-факторы:**
- `Relevance/Recency Weights` — баланс свежести и релевантности

**Команды для агента:**
- «При retrieval вычисляй средний возраст поднятых memories: `AVG(NOW() - created_at)`. Записывай в телеметрию.»

---

## 3. Сводка приоритетов

| # | Метрика | Target | Частота проверки |
|---|---------|--------|------------------|
| 1 | Hallucination Rate | < 5% | Каждый macro-cycle |
| 2 | Retrieval Precision | > 80% | Каждый macro-cycle |
| 3 | Retrieval Recall | > 70% | На golden dataset |
| 4 | Context Utilization | > 90% | Каждый macro-cycle |
| 5 | Latency P95 | < 5s | Continuous |
| 6 | Error Rate | < 1% | Continuous |
| 7 | Token Cost | < $0.01/req | Daily |
| 8 | Hit Rate | > 80% | Diagnostic |
| 9 | Memory Age | — | Diagnostic |

---

## 4. Чеклист для реализации телеметрии

**Шаг 1: Создать таблицу**
- «Выполни SQL из SELFLEARN.md секция "Telemetry Storage Schema" для создания `telemetry_events`.»

**Шаг 2: Добавить запись базовых метрик**
- «В каждом агенте после выполнения добавь INSERT в `telemetry_events` с полями: `pipeline_id`, `stage`, `latency_ms`, `memories_found`.»

**Шаг 3: Добавить LLM-judge**
- «Создай функцию `evaluateRetrieval(query, memories)` которая вызывает LLM с промптом из SELFLEARN.md секция "LLM-Judge Prompts" и возвращает `{relevant: boolean, utilized: boolean, hallucination: boolean}`.»

**Шаг 4: Добавить дашборд**
- «Создай endpoint `/api/metrics` который возвращает JSON с текущими значениями всех метрик.»
