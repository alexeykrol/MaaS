# SELFLEARN — Система самообучения MaaS

*Создано: 2025-11-26*

> **Философия:** Основная цель системы — постоянное самообучение.
> Реальные диалоги с пользователем — лишь разновидность учебных кейсов.

---

## Ключевая идея

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTINUOUS LEARNING                       │
│                                                              │
│   ┌──────────────┐              ┌──────────────┐            │
│   │   РЕЖИМ 1    │              │   РЕЖИМ 2    │            │
│   │   ONLINE     │◄────────────►│   OFFLINE    │            │
│   │              │              │              │            │
│   │ Реальные     │   switch     │ Фоновое      │            │
│   │ диалоги      │              │ самообучение │            │
│   └──────────────┘              └──────────────┘            │
│          │                              │                    │
│          ▼                              ▼                    │
│   ┌─────────────────────────────────────────────┐           │
│   │           UNIFIED LEARNING LOOP              │           │
│   │                                              │           │
│   │  [Experience] → [Evaluate] → [Improve]       │           │
│   └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

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

**Циклы:**
1. **Micro-cycle** (каждые 5 минут idle)
   - Quick evaluation на subset тестов
   - Обновление быстрых метрик

2. **Macro-cycle** (каждый час idle или по расписанию)
   - Полный прогон golden dataset
   - A/B тест новых параметров
   - Memory consolidation

3. **Deep-cycle** (ночью или по команде)
   - Полная переоценка LSM
   - Recompute embeddings (когда будут)
   - Heavy experiments

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

## Импакт-факторы (что можем менять)

> **Детальное описание:** см. [IMPACT_FACTORS.md](./IMPACT_FACTORS.md)
>
> Этот раздел содержит краткую сводку. Полный анализ с обоснованиями, механизмами влияния и рекомендациями — в отдельном документе.

### Сводка по значимости (убывание)

| # | Фактор | Влияние | Категория |
|---|--------|---------|-----------|
| 1 | **Retrieval Strategy** | ⬛⬛⬛⬛⬛ | Архитектурный |
| 2 | **Keyword Extraction** | ⬛⬛⬛⬛⬛ | Retrieval |
| 3 | **Archivist Tag Quality** | ⬛⬛⬛⬛ | Memory Creation |
| 4 | **top_k** | ⬛⬛⬛⬛ | Retrieval |
| 5 | **System Prompt** | ⬛⬛⬛ | LLM Behavior |
| 6 | **LLM Model** | ⬛⬛⬛ | LLM |
| 7 | **Relevance/Recency Weights** | ⬛⬛ | Ranking |
| 8 | **Max Context Tokens** | ⬛⬛ | Context |
| 9 | **Temperature** | ⬛ | LLM |

### Ключевые параметры для экспериментов

| Параметр | Безопасный диапазон | Текущее | Auto-tunable |
|----------|---------------------|---------|--------------|
| `top_k` | 1-5 | 3 | ✅ |
| `keyword_count` | 3-7 | 5 | ✅ |
| `relevance_weight` | 0.3-0.7 | 0.5 | ✅ |
| `recency_weight` | 0.3-0.7 | 0.5 | ✅ |
| `temperature` | 0.5-0.9 | 0.7 | ✅ |
| `max_context_tokens` | 1000-8000 | 4000 | ⚠️ |
| `model` | mini/4o | mini | ❌ Manual |
| `system_prompt` | versions | v1 | ❌ A/B only |

**Легенда:**
- ✅ Auto-tunable — система может менять автоматически
- ⚠️ Осторожно — требует мониторинга
- ❌ Manual — только с подтверждением

---

## Метрики качества (что измеряем)

### Primary Metrics (цели оптимизации)

| Метрика | Описание | Target | Как измерить |
|---------|----------|--------|--------------|
| **Retrieval Precision** | % релевантных из найденных | > 80% | LLM-judge |
| **Retrieval Recall** | % найденных из релевантных | > 70% | Golden dataset |
| **Context Utilization** | LLM использовал контекст | > 90% | LLM-judge |
| **Hallucination Rate** | LLM выдумал факты | < 5% | LLM-judge |
| **User Satisfaction** | Пользователь доволен | > 4/5 | Feedback |

### Secondary Metrics (constraints)

| Метрика | Описание | Target | Как измерить |
|---------|----------|--------|--------------|
| **Latency P50** | Медианное время ответа | < 2s | Timestamp |
| **Latency P95** | 95-й перцентиль | < 5s | Timestamp |
| **Token Cost** | Стоимость на запрос | < $0.01 | OpenAI usage |
| **Memory Growth** | Рост LSM в день | < 100 | COUNT |

### Diagnostic Metrics (понимание системы)

| Метрика | Описание | Как измерить |
|---------|----------|--------------|
| **Hit Rate** | % запросов с memories | COUNT |
| **Avg Memories Found** | Среднее найденных | AVG |
| **Tag Overlap Distribution** | Распределение совпадений | Histogram |
| **Memory Age at Retrieval** | Возраст используемых memories | AVG |

---

## Golden Dataset

### Структура тестового примера

```typescript
interface GoldenExample {
  id: string;

  // Input
  user_query: string;
  user_context?: {
    previous_queries?: string[];
    known_facts?: string[];
  };

  // Expected Output
  expected: {
    should_retrieve: boolean;           // Нужен ли контекст?
    relevant_memory_ids?: string[];     // Какие memories релевантны
    key_facts_in_response?: string[];   // Что должно быть в ответе
    forbidden_in_response?: string[];   // Чего НЕ должно быть
  };

  // Metadata
  category: 'factual' | 'preference' | 'temporal' | 'multi-hop';
  difficulty: 'easy' | 'medium' | 'hard';
}
```

### Категории тестов

1. **Factual Recall** — помнит ли система факты
   - "What's my favorite programming language?"
   - "Where do I work?"

2. **Preference Inference** — выводит ли предпочтения
   - "What kind of movies would I like?"
   - "Should I use tabs or spaces?"

3. **Temporal Reasoning** — понимает ли время
   - "What did we discuss yesterday?"
   - "Has my opinion on X changed?"

4. **Multi-hop** — связывает ли факты
   - "Based on my work and interests, what conferences should I attend?"

5. **Negative Cases** — когда НЕ должен использовать память
   - "What is 2+2?"
   - "Tell me about quantum physics"

---

## Эксперименты

### Структура эксперимента

```typescript
interface Experiment {
  id: string;
  name: string;
  hypothesis: string;

  // What we're testing
  variant: {
    parameter: string;
    baseline_value: any;
    test_value: any;
  };

  // How we measure
  metrics: string[];
  success_criteria: {
    metric: string;
    direction: 'increase' | 'decrease';
    min_delta: number;          // Минимальное изменение
    statistical_significance: number; // p-value threshold
  }[];

  // Results
  results?: {
    baseline_metrics: Record<string, number>;
    variant_metrics: Record<string, number>;
    p_values: Record<string, number>;
    conclusion: 'winner' | 'loser' | 'inconclusive';
  };
}
```

### Пример эксперимента

```yaml
Experiment: "top_k_5_vs_3"
Hypothesis: "Увеличение top_k до 5 улучшит recall без потери precision"

Variant:
  parameter: retrieval.top_k
  baseline: 3
  test: 5

Metrics:
  - retrieval_precision
  - retrieval_recall
  - hallucination_rate
  - latency_p50

Success Criteria:
  - metric: retrieval_recall
    direction: increase
    min_delta: 0.05
  - metric: retrieval_precision
    direction: decrease
    max_delta: 0.03  # допустимое падение
  - metric: hallucination_rate
    direction: decrease
    max_delta: 0.02

Test Size: 100 examples
Duration: 1 macro-cycle
```

---

## Архитектура Self-Learning Engine

```
┌─────────────────────────────────────────────────────────────┐
│                   SELF-LEARNING ENGINE                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Scheduler  │  │  Evaluator  │  │  Optimizer  │         │
│  │             │  │             │  │             │         │
│  │ - Idle      │  │ - Run tests │  │ - Update    │         │
│  │   detection │  │ - Compute   │  │   params    │         │
│  │ - Cycle     │  │   metrics   │  │ - A/B       │         │
│  │   trigger   │  │ - Judge     │  │   decisions │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    TELEMETRY DB                      │   │
│  │                                                      │   │
│  │  experiments | metrics | parameter_history | alerts  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Компоненты

1. **Scheduler**
   - Определяет, когда система idle
   - Запускает нужный цикл (micro/macro/deep)
   - Приоритизирует эксперименты

2. **Evaluator**
   - Прогоняет golden dataset
   - Вычисляет метрики
   - Использует LLM-judge для качественных оценок

3. **Optimizer**
   - Анализирует результаты экспериментов
   - Принимает решения об изменении параметров
   - Откатывает неудачные изменения

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

## Metrics & Storage (от Codex)

> *Добавлено: 2025-11-26*

### Метрики по циклам

| Цикл | Метрики | Частота |
|------|---------|---------|
| **Micro** (5 мин) | latency, token_cost, error_rate, retry_rate | Каждый запрос |
| **Macro** (1 час) | retrieval precision/recall на golden set, hit_rate, context_utilization | Batch |
| **Deep** (ночь) | качество консолидации, decay effectiveness, memory age distribution | Full scan |

### Telemetry Storage Schema

```sql
CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  pipeline_id UUID REFERENCES pipeline_runs(id),
  experiment_id UUID,           -- NULL если не эксперимент
  variant VARCHAR(50),          -- 'baseline' | 'test_a' | 'test_b'
  cycle_type VARCHAR(20),       -- 'micro' | 'macro' | 'deep'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stage VARCHAR(50),            -- 'analyzer' | 'assembler' | 'responder' | 'e2e'
  latency_ms INTEGER,

  -- Retrieval metrics
  memories_found INTEGER,
  memories_used INTEGER,
  hit_rate BOOLEAN,             -- TRUE если memories > 0
  avg_memory_age_days NUMERIC,
  tag_overlap_score NUMERIC,

  -- Token metrics
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost_usd NUMERIC(10, 6),

  -- Quality (from LLM-judge)
  retrieval_relevant BOOLEAN,   -- Judge: релевантные memories?
  context_utilized BOOLEAN,     -- Judge: LLM использовал контекст?
  hallucination_detected BOOLEAN, -- Judge: есть выдумки?

  -- Reliability
  retry_count INTEGER DEFAULT 0,
  error_type VARCHAR(100),

  -- Isolation (security)
  user_id UUID,
  isolation_ok BOOLEAN DEFAULT TRUE, -- Проверка tenant isolation

  CONSTRAINT valid_cycle CHECK (cycle_type IN ('micro', 'macro', 'deep', 'online'))
);

-- Индексы для быстрой аналитики
CREATE INDEX idx_telemetry_experiment ON telemetry_events(experiment_id, variant);
CREATE INDEX idx_telemetry_cycle ON telemetry_events(cycle_type, created_at);
CREATE INDEX idx_telemetry_pipeline ON telemetry_events(pipeline_id);
```

### Агрегации для дашборда

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

-- Сравнение вариантов эксперимента
SELECT
  variant,
  AVG(latency_ms) as avg_latency,
  AVG(CASE WHEN retrieval_relevant THEN 1 ELSE 0 END) as precision,
  AVG(CASE WHEN hallucination_detected THEN 1 ELSE 0 END) as hallucination_rate
FROM telemetry_events
WHERE experiment_id = $1
GROUP BY variant;
```

---

## LLM-Judge Prompts (от Codex)

### 1. Retrieval Relevance Judge

```
You are evaluating whether retrieved memories are relevant to a user query.

User Query: {query}

Retrieved Memories:
{memories}

For each memory, answer:
1. Is this memory relevant to the query? (yes/no)
2. Confidence (high/medium/low)

Then provide overall:
- Precision: X out of Y memories were relevant
- Any memories that seem completely off-topic?

Respond in JSON:
{
  "per_memory": [{"id": "...", "relevant": true/false, "confidence": "..."}],
  "precision": 0.XX,
  "notes": "..."
}
```

### 2. Context Utilization Judge

```
You are evaluating whether an AI response actually used the provided context.

Context Provided:
{context}

User Query: {query}

AI Response: {response}

Evaluate:
1. Did the response reference information from the context? (yes/partial/no)
2. Could the response have been generated without the context? (yes/no)
3. Did the response contradict the context? (yes/no)

Respond in JSON:
{
  "context_used": "yes" | "partial" | "no",
  "could_answer_without_context": true/false,
  "contradicts_context": true/false,
  "evidence": "quote from response that shows context usage or lack thereof"
}
```

### 3. Hallucination Detection Judge

```
You are checking if an AI response contains hallucinated information.

Known Facts (from memory/context):
{known_facts}

User Query: {query}

AI Response: {response}

Check:
1. Does the response claim facts not present in Known Facts?
2. Does the response contradict Known Facts?
3. Does the response make up specific details (names, dates, numbers)?

Respond in JSON:
{
  "hallucination_detected": true/false,
  "hallucinated_claims": ["claim 1", "claim 2"],
  "contradictions": ["contradiction 1"],
  "severity": "none" | "minor" | "major"
}
```

---

## Parameter Versioning (от Codex)

### Где хранить экспериментальные настройки

```sql
CREATE TABLE experiment_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Versioning
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT FALSE,

  -- Parameter values (JSONB для гибкости)
  retrieval_params JSONB DEFAULT '{
    "top_k": 3,
    "keyword_count": 5,
    "relevance_weight": 0.5,
    "recency_weight": 0.5,
    "min_tag_overlap": 1
  }',

  context_params JSONB DEFAULT '{
    "max_tokens": 4000,
    "memory_order": "relevance",
    "include_metadata": true
  }',

  llm_params JSONB DEFAULT '{
    "model": "gpt-4o-mini",
    "temperature": 0.7
  }',

  archivist_params JSONB DEFAULT '{
    "max_tags": 5,
    "summary_length": "medium"
  }',

  -- Metadata
  change_reason TEXT,
  changed_by VARCHAR(50), -- 'auto' | 'manual' | experiment_id

  CONSTRAINT one_active UNIQUE (is_active) WHERE is_active = TRUE
);

-- Переключение на новую версию
CREATE OR REPLACE FUNCTION activate_parameter_version(target_version INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE experiment_parameters SET is_active = FALSE WHERE is_active = TRUE;
  UPDATE experiment_parameters SET is_active = TRUE WHERE version = target_version;
END;
$$ LANGUAGE plpgsql;

-- Откат к предыдущей версии
CREATE OR REPLACE FUNCTION rollback_parameters()
RETURNS void AS $$
DECLARE
  current_ver INTEGER;
  prev_ver INTEGER;
BEGIN
  SELECT version INTO current_ver FROM experiment_parameters WHERE is_active = TRUE;
  SELECT MAX(version) INTO prev_ver FROM experiment_parameters WHERE version < current_ver;
  PERFORM activate_parameter_version(prev_ver);
END;
$$ LANGUAGE plpgsql;
```

### Как Optimizer меняет параметры

```typescript
async function updateParameter(
  param: string,
  newValue: any,
  reason: string
): Promise<void> {
  // 1. Создать новую версию
  const currentParams = await getCurrentParams();
  const newVersion = currentParams.version + 1;

  // 2. Обновить нужный параметр
  const updatedParams = {
    ...currentParams,
    [getParamCategory(param)]: {
      ...currentParams[getParamCategory(param)],
      [param]: newValue
    }
  };

  // 3. Сохранить
  await db.query(`
    INSERT INTO experiment_parameters (version, retrieval_params, ..., change_reason, changed_by)
    VALUES ($1, $2, ..., $3, 'auto')
  `, [newVersion, updatedParams.retrieval_params, reason]);

  // 4. Активировать
  await db.query(`SELECT activate_parameter_version($1)`, [newVersion]);

  logger.info(`[Optimizer] Updated ${param} to ${newValue}: ${reason}`);
}
```

---

## Границы автономии (от Codex)

### Что система может менять АВТОМАТИЧЕСКИ

| Параметр | Диапазон | Условие |
|----------|----------|---------|
| `top_k` | 1-5 | precision/recall trade-off |
| `relevance_weight` | 0.3-0.7 | Не крайние значения |
| `recency_weight` | 0.3-0.7 | Не крайние значения |
| `keyword_count` | 3-7 | Постепенно |
| `temperature` | 0.5-0.9 | Для ответов |
| `prompt_version` | Только A/B tested | После статзначимости |

### Что требует РУЧНОГО подтверждения

| Изменение | Причина |
|-----------|---------|
| Смена модели (mini → 4o) | Стоимость ×10 |
| Включение pgvector | Архитектурное изменение |
| Изменение RLS политик | Безопасность |
| top_k > 5 | Риск деградации качества |
| Удаление memories | Необратимо |
| Изменение Archivist prompts | Влияет на долгосрочную память |

### Защита от деградации (Auto-Rollback)

```typescript
const DEGRADATION_RULES = {
  // Если precision падает > 10% за 3 цикла — откат
  retrieval_precision: { threshold: -0.10, cycles: 3 },

  // Если hallucination растёт > 5% за 2 цикла — откат
  hallucination_rate: { threshold: +0.05, cycles: 2 },

  // Если latency P95 > 5s за 5 циклов — откат
  latency_p95: { threshold: 5000, cycles: 5 },

  // Если error_rate > 10% — немедленный откат
  error_rate: { threshold: 0.10, cycles: 1 },
};

async function checkDegradation(metrics: Metrics[]): Promise<boolean> {
  for (const [metric, rule] of Object.entries(DEGRADATION_RULES)) {
    const recentValues = metrics.slice(-rule.cycles).map(m => m[metric]);
    const baseline = await getBaselineMetric(metric);

    const degraded = recentValues.every(v =>
      isDegraded(v, baseline, rule.threshold)
    );

    if (degraded) {
      logger.error(`[Optimizer] DEGRADATION DETECTED: ${metric}`);
      await rollbackParameters();
      await alertAdmin(`Auto-rollback triggered: ${metric} degraded`);
      return true;
    }
  }
  return false;
}
```

---

## A/B Testing Protocol (от Codex)

### Variant Assignment

**Стратегия:** По тестовому примеру (не по пользователю)

```typescript
interface ABTestConfig {
  experiment_id: string;
  variants: string[];          // ['baseline', 'variant_a']
  split: number[];             // [0.5, 0.5]
  assignment: 'by_example' | 'by_user';
}

function assignVariant(
  config: ABTestConfig,
  exampleId: string
): string {
  // Детерминистичный хеш для воспроизводимости
  const hash = hashCode(`${config.experiment_id}:${exampleId}`);
  const bucket = hash % 100;

  let cumulative = 0;
  for (let i = 0; i < config.variants.length; i++) {
    cumulative += config.split[i] * 100;
    if (bucket < cumulative) {
      return config.variants[i];
    }
  }
  return config.variants[0];
}
```

### Statistical Significance

```typescript
// Минимальные требования для принятия решения
const MIN_SAMPLES_PER_VARIANT = 50;
const P_VALUE_THRESHOLD = 0.05;

function isSignificant(
  baseline: number[],
  variant: number[]
): { significant: boolean; pValue: number } {
  if (baseline.length < MIN_SAMPLES_PER_VARIANT ||
      variant.length < MIN_SAMPLES_PER_VARIANT) {
    return { significant: false, pValue: 1.0 };
  }

  // Two-sample t-test
  const pValue = tTest(baseline, variant);
  return {
    significant: pValue < P_VALUE_THRESHOLD,
    pValue
  };
}
```

---

## Safety & Isolation (от Codex)

### Правила для self-learning

1. **RLS всегда активна** — эксперименты не обходят Row-Level Security
2. **Метрика утечки = 0** — любое нарушение изоляции = критический alert
3. **Golden dataset изолирован** — тестовые данные не смешиваются с реальными
4. **Audit log** — все автоматические изменения логируются

### Isolation Test

```typescript
async function testTenantIsolation(): Promise<boolean> {
  const testUserA = 'test-user-a';
  const testUserB = 'test-user-b';

  // Создаём память для user A
  await createMemory(testUserA, 'Secret info for A');

  // Пытаемся получить её от имени user B
  const memoriesForB = await getMemories(testUserB, 'secret');

  // Должно быть 0
  if (memoriesForB.length > 0) {
    logger.error('[SECURITY] Tenant isolation FAILED!');
    await alertAdmin('CRITICAL: Memory leak between tenants');
    return false;
  }

  // Cleanup
  await deleteTestMemory(testUserA);

  return true;
}
```

### Обязательные проверки в каждом macro-cycle

```typescript
async function macroSecurityChecks(): Promise<void> {
  // 1. Tenant isolation
  const isolationOk = await testTenantIsolation();
  await logTelemetry({ isolation_ok: isolationOk });

  // 2. No PII in logs (sample check)
  const piiDetected = await scanLogsForPII();
  if (piiDetected) {
    await alertAdmin('PII detected in logs');
  }

  // 3. RLS policies active
  const rlsActive = await checkRLSEnabled();
  if (!rlsActive) {
    await alertAdmin('CRITICAL: RLS disabled');
  }
}
```

---

## Полный список автоматизируемых метрик (от Codex)

### Retrieval

| Метрика | Формула | Автоматизация |
|---------|---------|---------------|
| Hit Rate | `memories_found > 0 / total` | Автоматически |
| Precision@K | `relevant / retrieved` | LLM-judge |
| MRR | `1/rank_of_first_relevant` | Golden dataset |
| No-context rate | `memories_found == 0 / total` | Автоматически |

### Response Quality

| Метрика | Как измерять | Автоматизация |
|---------|--------------|---------------|
| Context utilized | LLM-judge | Автоматически |
| Fact consistency | Compare response vs LSM | LLM-judge |
| Hallucination | Check claims vs known facts | LLM-judge |
| Style match | Compare to user profile | Future (нужен профиль) |

### Производительность

| Метрика | Как измерять | Target |
|---------|--------------|--------|
| E2E latency P50 | `completed_at - created_at` | < 2s |
| E2E latency P95 | Percentile | < 5s |
| Stage latency | Per-stage timestamps | Analyzer < 500ms |
| Token cost | OpenAI usage | < $0.01/req |

### Надёжность

| Метрика | Как измерять | Target |
|---------|--------------|--------|
| Retry rate | `retries > 0 / total` | < 5% |
| Error rate | `FAILED / total` | < 1% |
| Reconnect count | LISTEN reconnects | < 1/hour |

### Изоляция

| Метрика | Как измерять | Target |
|---------|--------------|--------|
| Tenant leak | Cross-user memory access | **= 0** |
| RLS violations | Security audit | **= 0** |

---

## Реализация (фазы)

### Phase 1: Telemetry Foundation
- [ ] Таблица `telemetry_events` для сбора метрик
- [ ] Базовый сбор: latency, hit_rate, token_count
- [ ] Dashboard или export в CSV

### Phase 2: Golden Dataset
- [ ] Создать 50+ тестовых примеров
- [ ] Категоризация по типам
- [ ] Evaluation script

### Phase 3: LLM-Judge
- [ ] Prompts для оценки качества
- [ ] Retrieval relevance judge
- [ ] Hallucination detection

### Phase 4: Experiment Framework
- [ ] Experiment runner
- [ ] Statistical significance tests
- [ ] Auto-rollback mechanism

### Phase 5: Scheduler
- [ ] Idle detection
- [ ] Cycle scheduling
- [ ] Priority queue for experiments

### Phase 6: Optimizer
- [ ] Decision rules
- [ ] Parameter update logic
- [ ] Alerting on anomalies

---

## Примеры сценариев самообучения

### Сценарий A: "Система научилась, что top_k=2 лучше"

```
Day 1: top_k=3 (default)
- Run 100 tests, precision=0.65

Day 2: Experiment top_k=2
- Run 100 tests, precision=0.78
- p-value < 0.05, significant improvement
- Auto-apply top_k=2

Day 3: Validate
- Run 100 tests, precision=0.76 (confirmed)
- Log: "top_k=2 adopted"
```

### Сценарий B: "Обнаружена проблема с временными запросами"

```
Cycle N: Normal operation
- Overall precision: 0.75
- Temporal queries precision: 0.42 (!)

Alert: "Temporal reasoning underperforming"

Auto-action:
- Increase weight of recency in retrieval
- Add "when" to keyword extraction triggers
- Schedule deep analysis of temporal memories
```

### Сценарий C: "Memory consolidation"

```
Deep-cycle:
- Found: 5 memories about "user prefers Python"
- Action: Consolidate into 1 strong memory
- Boost: confidence_score for consolidated memory
- Result: Faster retrieval, less redundancy
```

---

## Связанные файлы

- [IMPACT_FACTORS.md](./IMPACT_FACTORS.md) — **детальный анализ импакт-факторов** (приоритет, механизмы влияния, рекомендации)
- [IDEAS.md](./IDEAS.md) — идеи для улучшения (input для экспериментов)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — текущая архитектура
- [Test/TEST_REGISTRY.md](./Test/TEST_REGISTRY.md) — существующие тесты

---

## Вопросы для обсуждения

### Открытые вопросы

1. **Как определять idle?**
   - По времени последнего запроса?
   - По расписанию (ночью)?
   - По нагрузке на систему?

2. **Кто принимает решения?**
   - Автоматика (rules-based)?
   - LLM-agent?
   - Human-in-the-loop для критичных изменений?

### Решённые вопросы

3. ✅ **Как откатывать?**
   - **Решение:** Parameter Versioning (см. секцию выше)
   - Таблица `experiment_parameters` с версионированием
   - Функции `activate_parameter_version()` и `rollback_parameters()`

4. ✅ **Границы автономии?**
   - **Решение:** см. секцию "Границы автономии" и [IMPACT_FACTORS.md](./IMPACT_FACTORS.md)
   - Auto-tunable: top_k (1-5), weights (0.3-0.7), temperature (0.5-0.9)
   - Manual only: model switch, RLS changes, Archivist prompts

---

*Этот файл — living document для развития самообучающейся системы*
