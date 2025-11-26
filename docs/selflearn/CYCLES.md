# Learning Cycles

> Когда и как запускается обучение системы.

---

## Два режима работы

### Режим 1: ONLINE (Real-time)

**Когда:** Пользователь активен, идёт реальный диалог.

**Что происходит:**
- Система отвечает на запросы (приоритет: latency, качество)
- Каждый диалог записывается как training example
- Минимальная фоновая работа (не мешать пользователю)

**Метрики:**
- Response latency (< 3s target)
- User satisfaction (если есть feedback)
- Context utilization

**После диалога:**
- Archivist создаёт память
- Диалог добавляется в training pool
- Обновляется user profile (будущее)

---

### Режим 2: OFFLINE (Background Learning)

**Когда:** Нет активных запросов от пользователя (idle time).

**Что происходит:**
- Циклический прогон тестов на golden dataset
- Эксперименты с импакт-факторами
- Переоценка качества существующих memories
- Консолидация и дедупликация LSM
- Обновление весов и порогов

---

## Типы циклов

| Цикл | Триггер | Что делает | Метрики |
|------|---------|------------|---------|
| **Micro** | 5 мин idle | Quick evaluation на subset тестов | latency, token_cost, error_rate |
| **Macro** | 1 час idle | Полный прогон golden dataset, A/B тесты | precision, recall, hit_rate |
| **Deep** | Ночь | Переоценка LSM, recompute embeddings | consolidation quality, memory age |

### Micro-cycle (каждые 5 минут idle)

- Quick evaluation на subset тестов
- Обновление быстрых метрик
- **Артефакт:** `telemetry_events` с `cycle_type = 'micro'`

### Macro-cycle (каждый час idle или по расписанию)

- Полный прогон golden dataset
- A/B тест новых параметров
- Memory consolidation
- **Артефакт:** `telemetry_events` с `cycle_type = 'macro'`

### Deep-cycle (ночью или по команде)

- Полная переоценка LSM
- Recompute embeddings (когда будут)
- Heavy experiments
- **Артефакт:** `telemetry_events` с `cycle_type = 'deep'`

---

## Unified Learning Loop

Один и тот же цикл для обоих режимов:

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  1. EXPERIENCE                                               │
│     ├── Online: реальный диалог                              │
│     └── Offline: синтетический тест из golden dataset        │
│                                                              │
│  2. EVALUATE                                                 │
│     ├── Retrieval: нашли ли нужные memories?                │
│     ├── Context: использовал ли LLM контекст?               │
│     ├── Response: качество ответа                           │
│     └── Outcome: user feedback / LLM-judge                  │
│                                                              │
│  3. LEARN                                                    │
│     ├── Update metrics (всегда)                             │
│     ├── Adjust weights (если статистически значимо)         │
│     ├── Flag bad memories (для review)                      │
│     └── Generate new hypotheses                             │
│                                                              │
│  4. IMPROVE                                                  │
│     ├── Apply learned weights                               │
│     ├── Prune low-quality memories                          │
│     └── Update retrieval parameters                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Telemetry Storage

**Артефакт:** таблица `telemetry_events`

```sql
CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  pipeline_id UUID REFERENCES pipeline_runs(id),
  experiment_id UUID,           -- NULL если не эксперимент
  variant VARCHAR(50),          -- 'baseline' | 'test_a' | 'test_b'
  cycle_type VARCHAR(20),       -- 'micro' | 'macro' | 'deep' | 'online'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stage VARCHAR(50),            -- 'analyzer' | 'assembler' | 'responder' | 'e2e'
  latency_ms INTEGER,

  -- Retrieval metrics
  memories_found INTEGER,
  memories_used INTEGER,
  hit_rate BOOLEAN,
  avg_memory_age_days NUMERIC,
  tag_overlap_score NUMERIC,

  -- Token metrics
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost_usd NUMERIC(10, 6),

  -- Quality (from LLM-judge)
  retrieval_relevant BOOLEAN,
  context_utilized BOOLEAN,
  hallucination_detected BOOLEAN,

  -- Reliability
  retry_count INTEGER DEFAULT 0,
  error_type VARCHAR(100),

  -- Isolation
  user_id UUID,
  isolation_ok BOOLEAN DEFAULT TRUE,

  CONSTRAINT valid_cycle CHECK (cycle_type IN ('micro', 'macro', 'deep', 'online'))
);

CREATE INDEX idx_telemetry_experiment ON telemetry_events(experiment_id, variant);
CREATE INDEX idx_telemetry_cycle ON telemetry_events(cycle_type, created_at);
CREATE INDEX idx_telemetry_pipeline ON telemetry_events(pipeline_id);
```

---

## Агрегации для дашборда

```sql
-- P50/P95 latency за последний час
SELECT
  stage,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
FROM telemetry_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY stage;

-- Hit rate по дням
SELECT
  DATE(created_at) as day,
  COUNT(*) FILTER (WHERE hit_rate) * 100.0 / COUNT(*) AS hit_rate_pct
FROM telemetry_events
GROUP BY DATE(created_at);
```

---

## Self-Improvement Mechanisms

### 1. Parameter Tuning (автоматический)

```
IF retrieval_precision < 0.7 for 3 cycles:
  - Decrease top_k by 1
  - Log decision
  - Set cooldown for parameter

IF retrieval_recall < 0.5 for 3 cycles:
  - Increase keyword_count by 2
  - Log decision
```

### 2. Memory Quality Scoring

```
FOR each memory in LSM:
  - Track: times_retrieved, times_used, times_helpful
  - Compute: quality_score = used/retrieved * helpful/used
  - IF quality_score < 0.1 for 30 days:
    - Flag for review
    - Consider pruning
```

### 3. Prompt Evolution

```
IF hallucination_rate > 0.1:
  - Generate prompt variants
  - A/B test on golden dataset
  - Apply winner
```

### 4. Memory Consolidation

```
DURING deep-cycle:
  - Find similar memories (будущее: cosine similarity)
  - Merge redundant facts
  - Update semantic tags
  - Remove outdated info
```

---

## Команды для агента

1. «Создай таблицу `telemetry_events` по схеме выше.»
2. «Добавь запись телеметрии после каждого pipeline run с `cycle_type = 'online'`.»
3. «Реализуй `src/selflearn/scheduler.ts` с idle detection и запуском циклов.»

---

*См. также: [EXPERIMENTS.md](./EXPERIMENTS.md) — как проводить A/B тесты в циклах*
