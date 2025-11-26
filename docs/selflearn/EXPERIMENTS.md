# Experiments & A/B Testing

> Как проводить эксперименты и принимать решения на основе данных.

---

## Структура эксперимента

**Артефакт:** интерфейс в `[NEW] src/selflearn/optimizer.ts`

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
    min_delta: number;
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

---

## Пример эксперимента

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

## A/B Testing Protocol

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

## Сравнение вариантов (SQL)

```sql
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

## Примеры сценариев

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

## Команды для агента

1. «Создай интерфейс `Experiment` в `src/selflearn/optimizer.ts`.»
2. «Реализуй функцию `assignVariant()` для детерминистичного распределения по вариантам.»
3. «Добавь функцию `isSignificant()` с t-test для проверки статистической значимости.»

---

*См. также: [AUTONOMY.md](./AUTONOMY.md) — какие параметры можно менять автоматически*
