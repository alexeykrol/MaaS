# METRICS — метрики системы MaaS

## 0. Определение метрики

> **Метрика** — это числовое значение, которое:
> 1. Вычисляется из конкретных данных в системе (таблицы, логи, timestamps)
> 2. Имеет формулу расчёта
> 3. Имеет target (целевое значение) или threshold (порог срабатывания)

Если нельзя указать: откуда берём данные → как вычисляем → какой target, — это не метрика.

**Исключение:** диагностические метрики могут не иметь target, но обязаны иметь источник данных и формулу.

---

## 0.1. Архитектура сбора метрик

MaaS не знает о системе самообучения. Сбор метрик происходит через **Sensor**:

```
MaaS (pipeline_runs, raw_logs, lsm_storage)
        │
        │ Sensor читает (SELECT)
        ▼
   sensor_events (таблица Self-Learning)
        │
        │ Teacher читает
        ▼
   Анализ, LLM-judge, эксперименты
```

**Sensor** — код, который:
- Подписан на события MaaS (по `pipeline_runs`)
- Читает данные из таблиц MaaS
- Вычисляет базовые метрики (latency, token_count, memories_found)
- Пишет в `sensor_events`

**Teacher** — код + LLM, который:
- Читает из `sensor_events`
- Запускает LLM-judge для качественных оценок (precision, hallucination)
- Записывает результаты оценок обратно в `sensor_events`

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

## 1.1. Артефакты

| Артефакт | Тип | Кто использует | Назначение |
|----------|-----|----------------|------------|
| `pipeline_runs` | Таблица MaaS | Sensor читает | Статусы, timestamps |
| `raw_logs` | Таблица MaaS | Sensor читает | Запросы, ответы, токены |
| `lsm_storage` | Таблица MaaS | Sensor читает | Найденные memories |
| `sensor_events` | Таблица Self-Learning | Sensor пишет, Teacher читает | Хранение метрик |
| LLM-judge | Модуль Teacher | Teacher вызывает | Оценка качества |

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

**Источник данных (MaaS):**
- `pipeline_runs.analysis_result` — какие memories были найдены
- `pipeline_runs.user_query` — исходный запрос

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `retrieval_relevant` (boolean) — заполняется Teacher через LLM-judge

**Кто вычисляет:**
- Sensor: записывает `pipeline_run_id`, `memories_found`
- Teacher: вызывает LLM-judge, записывает `retrieval_relevant`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE retrieval_relevant = true) * 100.0 /
  COUNT(*) FILTER (WHERE memories_found > 0)
FROM sensor_events
WHERE created_at > NOW() - INTERVAL '1 day';
```

**Target:** > 80%

**Симптомы проблемы:**
- Ответы содержат нерелевантную информацию о пользователе
- LLM упоминает факты, не относящиеся к вопросу

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 4: `top_k` — уменьшить для повышения precision
- Секция 1: `Retrieval Strategy` — добавить reranker

---

### 2.2. Retrieval Recall

**Тип:** Primary

**Источник данных (MaaS):**
- `pipeline_runs.analysis_result` — какие memories были найдены

**Источник данных (Self-Learning):**
- User Emulator генерирует диалоги с `expected_memory_ids`

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поля: `expected_memory_ids UUID[]`, `found_memory_ids UUID[]`

**Кто вычисляет:**
- User Emulator: при генерации диалога указывает `expected_memory_ids`
- Sensor: записывает `found_memory_ids` из `pipeline_runs`
- Teacher: вычисляет recall = found ∩ expected / expected

**Формула:**
```sql
SELECT
  AVG(
    array_length(found_memory_ids & expected_memory_ids, 1)::float /
    array_length(expected_memory_ids, 1)::float
  ) * 100
FROM sensor_events
WHERE expected_memory_ids IS NOT NULL
  AND created_at > NOW() - INTERVAL '1 day';
```

**Target:** > 70%

**Симптомы проблемы:**
- «Он меня не помнит» — пользователь знает, что говорил X, но система не нашла
- Ответы слишком общие, без персонализации

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 4: `top_k` — увеличить для повышения recall
- Секция 2: `Keyword Extraction` — улучшить извлечение ключей
- Секция 3: `Archivist Tagging` — улучшить теги при записи

---

### 2.3. Context Utilization

**Тип:** Primary

**Источник данных (MaaS):**
- `pipeline_runs.final_context_payload` — контекст, переданный LLM
- `pipeline_runs.final_answer` — ответ LLM

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `context_utilized` (boolean) — заполняется Teacher через LLM-judge

**Кто вычисляет:**
- Sensor: записывает `context_payload`, `final_answer`
- Teacher: вызывает LLM-judge, записывает `context_utilized`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE context_utilized = true) * 100.0 /
  COUNT(*) FILTER (WHERE memories_found > 0)
FROM sensor_events;
```

**Target:** > 90%

**Симптомы проблемы:**
- LLM игнорирует поднятый контекст
- Ответы не отличаются от ответов без памяти

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 5: `Responder System Prompt` — усилить инструкцию использовать контекст
- Секция 8: `Max Context Tokens` — проверить, что контекст не обрезается

---

### 2.4. Hallucination Rate

**Тип:** Primary

**Источник данных (MaaS):**
- `pipeline_runs.final_context_payload` — контекст
- `pipeline_runs.final_answer` — ответ LLM

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `hallucination_detected` (boolean) — заполняется Teacher через LLM-judge

**Кто вычисляет:**
- Sensor: записывает `context_payload`, `final_answer`
- Teacher: вызывает LLM-judge, записывает `hallucination_detected`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE hallucination_detected = true) * 100.0 /
  COUNT(*)
FROM sensor_events;
```

**Target:** < 5%

**Симптомы проблемы:**
- «Он приписывает мне то, чего я не говорил»
- Выдуманные факты о предпочтениях пользователя

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 5: `Responder System Prompt` — добавить запрет на выдумывание
- Секция 9: `Temperature` — снизить для уменьшения креативности

---

### 2.5. Latency P50/P95

**Тип:** Secondary

**Источник данных (MaaS):**
- `pipeline_runs.created_at`, `updated_at` — timestamps (уже существуют)

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `latency_ms INTEGER`

**Кто вычисляет:**
- Sensor: читает timestamps из `pipeline_runs`, вычисляет `latency_ms = updated_at - created_at`

**Формула:**
```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
FROM sensor_events
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Target:** P50 < 2000ms, P95 < 5000ms

**Симптомы проблемы:**
- Долгое ожидание ответа
- Таймауты на клиенте

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 6: `LLM Model` — использовать mini для простых запросов
- Секция 8: `Max Context Tokens` — уменьшить размер контекста

---

### 2.6. Token Cost

**Тип:** Secondary

**Источник данных (MaaS):**
- `raw_logs` — содержит информацию о LLM вызовах
- Либо нужно добавить поле в `pipeline_runs` для хранения usage

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поля: `prompt_tokens INT`, `completion_tokens INT`, `total_cost_usd NUMERIC(10,6)`

**Кто вычисляет:**
- Sensor: читает token usage из MaaS, вычисляет cost по формуле

**Формула:**
```sql
SELECT
  AVG(total_cost_usd) AS avg_cost_per_request,
  SUM(total_cost_usd) AS total_daily_cost
FROM sensor_events
WHERE created_at > NOW() - INTERVAL '1 day';
```

**Target:** < $0.01 per request

**Симптомы проблемы:**
- Неожиданно высокие счета от OpenAI
- Рост стоимости без роста качества

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 6: `LLM Model` — mini вместо 4o для простых запросов
- Секция 8: `Max Context Tokens` — ограничить размер контекста

---

### 2.7. Error Rate

**Тип:** Secondary

**Источник данных (MaaS):**
- `pipeline_runs.status` — уже существует (COMPLETED / FAILED)

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `is_error BOOLEAN`

**Кто вычисляет:**
- Sensor: читает `status` из `pipeline_runs`, записывает `is_error = (status = 'FAILED')`

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE is_error = true) * 100.0 / COUNT(*)
FROM sensor_events
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Target:** < 1%

**Симптомы проблемы:**
- Пользователи видят ошибки
- Запросы не обрабатываются

**Связанные импакт-факторы (см. IMPACTS.md):**
- Retry logic: `src/orchestrator/index.ts`, функция `withRetry()`

---

### 2.8. Hit Rate

**Тип:** Diagnostic (без жёсткого target)

**Источник данных (MaaS):**
- `pipeline_runs.analysis_result` — содержит найденные memories

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `memories_found INTEGER`

**Кто вычисляет:**
- Sensor: читает `analysis_result` из `pipeline_runs`, считает количество memories

**Формула:**
```sql
SELECT
  COUNT(*) FILTER (WHERE memories_found > 0) * 100.0 / COUNT(*)
FROM sensor_events;
```

**Target:** — (диагностическая, ориентир > 80% для персональных вопросов)

**Симптомы проблемы:**
- Низкий hit rate при наличии релевантной памяти = проблема retrieval
- Высокий hit rate при плохом precision = поднимается мусор

---

### 2.9. Memory Age at Retrieval

**Тип:** Diagnostic (без target)

**Источник данных (MaaS):**
- `pipeline_runs.analysis_result` — ID найденных memories
- `lsm_storage.created_at` — дата создания каждой memory

**Хранение (Self-Learning):**
- Таблица: `sensor_events`
- Поле: `avg_memory_age_days NUMERIC`

**Кто вычисляет:**
- Sensor: читает memory IDs из `pipeline_runs`, джойнит с `lsm_storage`, вычисляет средний возраст

**Формула:**
```sql
SELECT AVG(avg_memory_age_days)
FROM sensor_events
WHERE memories_found > 0;
```

**Target:** — (диагностическая, используется для анализа)

**Симптомы проблемы:**
- Слишком старые memories = система не учитывает свежие данные
- Слишком свежие = игнорируются важные старые факты

**Связанные импакт-факторы (см. IMPACTS.md):**
- Секция 7: `Relevance/Recency Weights` — баланс свежести и релевантности

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

## 4. Схема таблицы sensor_events

```sql
CREATE TABLE sensor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID NOT NULL,

  -- Базовые метрики (Sensor записывает)
  latency_ms INTEGER,
  memories_found INTEGER,
  found_memory_ids UUID[],
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost_usd NUMERIC(10,6),
  is_error BOOLEAN DEFAULT false,
  avg_memory_age_days NUMERIC,

  -- LLM-judge метрики (Teacher записывает)
  retrieval_relevant BOOLEAN,
  context_utilized BOOLEAN,
  hallucination_detected BOOLEAN,

  -- Для recall (User Emulator задаёт)
  expected_memory_ids UUID[],

  -- Метаданные
  source VARCHAR(50), -- 'emulator' | 'real_user'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 5. Кто что записывает

| Компонент | Поля в sensor_events |
|-----------|---------------------|
| **Sensor** | `pipeline_run_id`, `latency_ms`, `memories_found`, `found_memory_ids`, `prompt_tokens`, `completion_tokens`, `total_cost_usd`, `is_error`, `avg_memory_age_days`, `source` |
| **User Emulator** | `expected_memory_ids` (при генерации диалога) |
| **Teacher** | `retrieval_relevant`, `context_utilized`, `hallucination_detected` (через LLM-judge) |
