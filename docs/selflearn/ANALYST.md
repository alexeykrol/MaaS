# ANALYST — роль Аналитика

> **Ключевая задача:** "Что не так?" — анализ данных, вычисление метрик, формирование verdict.

---

## 0. Краткое определение

**Аналитик (Analyst)** — это модуль, который:

* **читает данные** из `sensor_events` и MaaS таблиц;
* **вычисляет метрики** по формальным формулам;
* **запускает LLM-judge** для качественных оценок;
* **сравнивает с targets** и формирует verdict;
* **диагностирует проблемы** — определяет, какая метрика worst.

Аналитик **не генерирует гипотезы** и **не предлагает изменения** — это задача Teacher.

---

## 1. Зона ответственности

### 1.1. Что делает Analyst

1. **Читает данные:**
   * `sensor_events` — метрики от Sensor
   * `pipeline_runs` — статусы, timestamps
   * `experiment_parameters` — текущие значения импактов
   * Golden dataset — для внешней валидации

2. **Вычисляет метрики:**
   * Primary: precision, recall, context utilization, hallucination rate
   * Secondary: latency, token cost, error rate
   * Diagnostic: hit rate, memory age

3. **Запускает LLM-judge:**
   * Retrieval Relevance — релевантна ли поднятая память?
   * Context Utilization — использован ли контекст в ответе?
   * Hallucination Detection — есть ли выдуманные факты?

4. **Сравнивает с targets:**
   * Вычисляет gap = target - current
   * Определяет, какие gaps превышают threshold
   * Ранжирует метрики по severity

5. **Формирует verdict:**
   * Какие метрики в норме, какие нет
   * Какая метрика worst (приоритет для исправления)
   * Диагноз: возможные причины проблемы

### 1.2. Чего Analyst НЕ делает

* **Не** генерирует гипотезы об изменениях — это Teacher
* **Не** предлагает новые значения импактов — это Teacher
* **Не** пишет в `impact_values` — это Tuner
* **Не** запускает эмуляцию — это Manager + Emulator

---

## 2. Входы и выходы

### 2.1. Входы

```typescript
interface AnalystInput {
  // От Manager
  analysis_request: {
    batch_id: string;
    scope: 'train' | 'validation' | 'golden';
    metrics_to_compute: string[];
  };

  // Из БД
  sensor_events: SensorEvent[];       // Сырые данные от Sensor
  target_metrics: TargetMetric[];     // Целевые значения
  current_impacts: ImpactValue[];     // Текущие значения импактов
}
```

### 2.2. Выходы

```typescript
interface AnalystOutput {
  type: 'analysis_verdict';
  batch_id: string;
  timestamp: Date;

  // Вычисленные метрики
  metrics: {
    precision: number;
    recall: number;
    hallucination_rate: number;
    context_utilization: number;
    latency_p50: number;
    latency_p95: number;
    error_rate: number;
    token_cost_avg: number;
  };

  // Сравнение с targets
  gaps: MetricGap[];

  // Verdict
  verdict: {
    status: 'healthy' | 'degraded' | 'critical';
    worst_metric: string;
    worst_gap: number;
    summary: string;
  };

  // Диагностика (для Teacher)
  diagnosis: {
    probable_causes: string[];
    affected_areas: ('retrieval' | 'generation' | 'context' | 'storage')[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}
```

### 2.3. Пример verdict

```json
{
  "type": "analysis_verdict",
  "batch_id": "batch_20241128_001",
  "timestamp": "2024-11-28T14:30:00Z",

  "metrics": {
    "precision": 0.65,
    "recall": 0.72,
    "hallucination_rate": 0.08,
    "context_utilization": 0.85,
    "latency_p95": 4200,
    "error_rate": 0.005
  },

  "gaps": [
    { "metric": "precision", "target": 0.80, "current": 0.65, "gap": 0.15, "exceeds_threshold": true },
    { "metric": "hallucination_rate", "target": 0.05, "current": 0.08, "gap": 0.03, "exceeds_threshold": true },
    { "metric": "recall", "target": 0.70, "current": 0.72, "gap": -0.02, "exceeds_threshold": false }
  ],

  "verdict": {
    "status": "degraded",
    "worst_metric": "precision",
    "worst_gap": 0.15,
    "summary": "Precision на 15 п.п. ниже target. Hallucination выше нормы на 3 п.п."
  },

  "diagnosis": {
    "probable_causes": [
      "top_k слишком большой — поднимается нерелевантная память",
      "keyword extraction может пропускать ключевые термины"
    ],
    "affected_areas": ["retrieval"],
    "severity": "high"
  }
}
```

---

## 3. Внутренняя структура

### 3.1. Metrics Aggregator

**Задача:** привести сырые `sensor_events` к агрегированным метрикам.

```typescript
interface MetricsAggregator {
  // Группировка по batch/experiment/variant
  groupEvents(events: SensorEvent[], groupBy: string[]): GroupedEvents;

  // Вычисление метрик
  computePrecision(events: SensorEvent[]): number;
  computeRecall(events: SensorEvent[]): number;
  computeHallucinationRate(events: SensorEvent[]): number;
  computeContextUtilization(events: SensorEvent[]): number;
  computeLatencyPercentiles(events: SensorEvent[]): { p50: number; p95: number };
  computeErrorRate(events: SensorEvent[]): number;
  computeTokenCost(events: SensorEvent[]): { avg: number; total: number };
}
```

**SQL для precision:**

```sql
SELECT
  COUNT(*) FILTER (WHERE retrieval_relevant = true) * 100.0 /
  NULLIF(COUNT(*) FILTER (WHERE memories_found > 0), 0) AS precision
FROM sensor_events
WHERE batch_id = $1;
```

### 3.2. LLM-Judge Orchestrator

**Задача:** запускать LLM для качественных оценок.

```typescript
interface JudgeOrchestrator {
  // Выборка событий для оценки (не все — дорого)
  selectForJudging(events: SensorEvent[], sampleSize: number): SensorEvent[];

  // Запуск judge'ей
  judgeRelevance(event: SensorEvent): Promise<boolean>;
  judgeContextUtilization(event: SensorEvent): Promise<boolean>;
  judgeHallucination(event: SensorEvent): Promise<boolean>;

  // Batch processing
  runAllJudges(events: SensorEvent[]): Promise<JudgeResults>;
}
```

**Промпт для Hallucination Judge:**

```markdown
## Task
Determine if the assistant's response contains hallucinated facts about the user.

## Context provided to assistant
{context_payload}

## Assistant's response
{final_answer}

## Instructions
1. Identify any claims about the user in the response
2. Check if each claim is supported by the context
3. If any claim is NOT supported → hallucination detected

## Output
Return JSON: { "hallucination_detected": true/false, "unsupported_claims": [...] }
```

### 3.3. Gap Calculator

**Задача:** сравнить текущие метрики с targets.

```typescript
interface GapCalculator {
  computeGaps(
    current: ComputedMetrics,
    targets: TargetMetric[]
  ): MetricGap[];

  rankByPriority(gaps: MetricGap[]): MetricGap[];  // critical → primary → secondary

  findWorstMetric(gaps: MetricGap[]): { metric: string; gap: number };
}
```

### 3.4. Diagnostician

**Задача:** определить вероятные причины проблем.

```typescript
interface Diagnostician {
  // На основе worst_metric и паттернов в данных
  diagnose(
    metrics: ComputedMetrics,
    gaps: MetricGap[],
    events: SensorEvent[]
  ): Diagnosis;
}

// Правила диагностики
const DIAGNOSIS_RULES = {
  low_precision: {
    probable_causes: [
      'top_k слишком большой',
      'keyword extraction неточный',
      'relevance weight слишком низкий'
    ],
    affected_areas: ['retrieval']
  },
  low_recall: {
    probable_causes: [
      'top_k слишком маленький',
      'similarity threshold слишком высокий',
      'archivist теги неполные'
    ],
    affected_areas: ['retrieval', 'storage']
  },
  high_hallucination: {
    probable_causes: [
      'temperature слишком высокий',
      'responder prompt не запрещает выдумывать',
      'контекст слишком короткий'
    ],
    affected_areas: ['generation']
  },
  low_context_utilization: {
    probable_causes: [
      'responder prompt не акцентирует использование контекста',
      'контекст слишком длинный и теряется'
    ],
    affected_areas: ['generation', 'context']
  }
};
```

---

## 4. Жизненный цикл работы Analyst

```
1. Получить analysis_request от Manager
       ↓
2. Загрузить sensor_events для batch_id
       ↓
3. Запустить Metrics Aggregator
   • Вычислить все метрики
       ↓
4. Запустить LLM-Judge (на выборке)
   • Обновить retrieval_relevant, context_utilized, hallucination_detected
       ↓
5. Загрузить target metrics
       ↓
6. Gap Calculator
   • Вычислить gaps
   • Найти worst_metric
       ↓
7. Diagnostician
   • Определить probable_causes
   • Определить affected_areas
       ↓
8. Сформировать verdict
       ↓
9. Отправить verdict Teacher'у (через Manager)
```

---

## 5. Артефакты и таблицы

### 5.1. Таблица analysis_verdicts

```sql
CREATE TABLE analysis_verdicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Вычисленные метрики
  metrics JSONB NOT NULL,

  -- Gaps
  gaps JSONB NOT NULL,

  -- Verdict
  verdict_status TEXT NOT NULL,  -- 'healthy' | 'degraded' | 'critical'
  worst_metric TEXT,
  worst_gap NUMERIC,
  summary TEXT,

  -- Diagnosis
  diagnosis JSONB
);
```

---

## 6. Инварианты и правила

1. **Источник истины — SQL-метрики**
   * Любой вывод должен ссылаться на конкретные числа

2. **LLM-judge — вторичный источник**
   * Дополняет SQL там, где нельзя формализовать (relevance, hallucination)

3. **Analyst не предлагает решений**
   * Только диагностирует: "что не так", "где проблема"
   * Решения — задача Teacher

4. **Все выводы реплицируемы**
   * Имея batch_id и snapshot данных, можно воспроизвести verdict

5. **Diagnosis — гипотезы, не факты**
   * `probable_causes` — это предположения для Teacher
   * Teacher решает, какую гипотезу проверять

---

## 7. Метрики качества Analyst

| Метрика | Описание | Target |
|---------|----------|--------|
| **Verdict Accuracy** | % случаев когда verdict корректно отражает состояние | > 95% |
| **Judge Consistency** | Согласованность LLM-judge между запусками | > 90% |
| **Diagnosis Hit Rate** | % случаев когда probable_cause оказался верным | > 70% |
| **Processing Time** | Время анализа одного batch | < 60s |

---

## 8. Связь с другими компонентами

```
Sensor ──────► sensor_events ──────► ANALYST
                                        │
                                        ▼
                                   verdict
                                        │
                                        ▼
Manager ◄─────────────────────────── ANALYST
    │
    ▼
TEACHER (получает verdict, генерирует гипотезы)
```

---

*Последнее обновление: 2025-11-28*
