# TEACHER — роль Учителя

> **Ключевая задача:** "Как исправить?" — генерация гипотез, выбор импактов, формирование рекомендаций.

---

## 0. Краткое определение

**Учитель (Teacher)** — это модуль, который:

* **получает verdict** от Analyst с диагнозом проблемы;
* **генерирует гипотезы** о том, какой импакт нужно изменить;
* **определяет направление и величину** изменения;
* **формирует рекомендации** для Tuner в машинно-читаемом виде;
* **отслеживает историю гипотез** — что уже пробовали, что сработало.

Teacher **не вычисляет метрики** и **не анализирует данные** — это задача Analyst.

---

## 0.1. Отличие от Analyst

| Аспект | Analyst | Teacher |
|--------|---------|---------|
| **Вопрос** | "Что не так?" | "Как исправить?" |
| **Вход** | sensor_events, raw data | verdict от Analyst |
| **Выход** | verdict, diagnosis | hypothesis, change_request |
| **Знания** | Формулы метрик | Связи метрика↔импакт |
| **LLM роль** | Judge (оценка качества) | Reasoner (генерация решений) |

---

## 1. Зона ответственности

### 1.1. Что делает Teacher

1. **Получает verdict от Analyst:**
   * Текущие метрики и gaps
   * Worst metric и её значение
   * Diagnosis с probable_causes

2. **Анализирует связи метрика↔импакт:**
   * Использует IMPACTS.md как справочник
   * Определяет, какой импакт влияет на worst_metric

3. **Генерирует гипотезу:**
   * Какой параметр менять
   * В какую сторону (увеличить/уменьшить)
   * На сколько (в пределах ±20%)

4. **Проверяет историю:**
   * Не пробовали ли это уже?
   * Не откатывались ли с такого значения?

5. **Формирует change_request:**
   * Структурированный запрос для Tuner
   * Условия rollback

### 1.2. Чего Teacher НЕ делает

* **Не** вычисляет метрики — это Analyst
* **Не** запускает LLM-judge — это Analyst
* **Не** пишет в `impact_values` — это Tuner
* **Не** запускает эмуляцию — это Manager

---

## 2. Входы и выходы

### 2.1. Входы

```typescript
interface TeacherInput {
  // От Analyst (через Manager)
  verdict: AnalystVerdict;

  // Из БД
  current_impacts: ImpactValue[];         // Текущие значения
  hypothesis_history: HypothesisRecord[]; // История гипотез
  parameter_history: ParameterChange[];   // История изменений
}
```

### 2.2. Выходы

```typescript
interface TeacherOutput {
  type: 'change_request';
  timestamp: Date;

  // Гипотеза
  hypothesis: {
    id: string;
    description: string;
    rationale: string;  // Почему это должно помочь
    confidence: 'low' | 'medium' | 'high';
  };

  // Предлагаемое изменение
  change: {
    impact_key: string;           // 'retrieval.top_k'
    current_value: any;
    proposed_value: any;
    change_percent: number;       // +10%, -15%
  };

  // Ожидаемый эффект
  expected_effect: {
    metric: string;               // 'precision'
    direction: 'increase' | 'decrease';
    estimated_delta: number;      // +0.05 (5%)
  };

  // Условия rollback
  rollback_conditions: {
    metric: string;
    threshold: number;
    cycles: number;
  }[];

  // Для Tuner
  change_request: ChangeRequest;
}
```

### 2.3. Пример change_request

```json
{
  "type": "change_request",
  "timestamp": "2024-11-28T15:00:00Z",

  "hypothesis": {
    "id": "hyp_20241128_001",
    "description": "Уменьшение top_k повысит precision за счёт фильтрации шума",
    "rationale": "Precision низкий (0.65 vs target 0.80). Diagnosis указывает на 'top_k слишком большой'. При top_k=5 поднимается много нерелевантных memories.",
    "confidence": "high"
  },

  "change": {
    "impact_key": "retrieval.top_k",
    "current_value": 5,
    "proposed_value": 4,
    "change_percent": -20
  },

  "expected_effect": {
    "metric": "precision",
    "direction": "increase",
    "estimated_delta": 0.10
  },

  "rollback_conditions": [
    { "metric": "precision", "threshold": -0.10, "cycles": 3 },
    { "metric": "recall", "threshold": -0.15, "cycles": 2 },
    { "metric": "hallucination_rate", "threshold": 0.05, "cycles": 2 }
  ],

  "change_request": {
    "changes": [
      { "param": "retrieval.top_k", "from": 5, "to": 4 }
    ],
    "reason": "hypothesis: precision low due to noise",
    "experiment_id": "exp_top_k_5_to_4",
    "initiator": "teacher"
  }
}
```

---

## 3. Внутренняя структура

### 3.1. Impact Knowledge Base

**Задача:** связать метрики с импактами.

```typescript
// Справочник связей (из IMPACTS.md)
const METRIC_TO_IMPACT: Record<string, ImpactInfo[]> = {
  'precision': [
    {
      impact: 'retrieval.top_k',
      direction: 'decrease',  // уменьшить top_k → повысить precision
      effect: 'strong',
      trade_off: 'recall может снизиться'
    },
    {
      impact: 'retrieval.relevance_weight',
      direction: 'increase',
      effect: 'medium',
      trade_off: 'свежие memories могут терять приоритет'
    }
  ],
  'recall': [
    {
      impact: 'retrieval.top_k',
      direction: 'increase',
      effect: 'strong',
      trade_off: 'precision может снизиться'
    },
    {
      impact: 'retrieval.similarity_threshold',
      direction: 'decrease',
      effect: 'medium',
      trade_off: 'может подниматься шум'
    }
  ],
  'hallucination_rate': [
    {
      impact: 'llm.temperature',
      direction: 'decrease',
      effect: 'strong',
      trade_off: 'ответы могут стать менее разнообразными'
    },
    {
      impact: 'prompts.responder',
      direction: 'strengthen_grounding',
      effect: 'medium',
      trade_off: null
    }
  ],
  'context_utilization': [
    {
      impact: 'prompts.responder',
      direction: 'emphasize_context',
      effect: 'strong',
      trade_off: null
    },
    {
      impact: 'context.max_tokens',
      direction: 'optimize',  // не слишком много, не слишком мало
      effect: 'medium',
      trade_off: 'баланс между полнотой и фокусом'
    }
  ]
};
```

### 3.2. Hypothesis Generator

**Задача:** на основе verdict и knowledge base сгенерировать гипотезу.

```typescript
interface HypothesisGenerator {
  generate(
    verdict: AnalystVerdict,
    currentImpacts: ImpactValue[],
    history: HypothesisRecord[]
  ): Hypothesis;
}

function generateHypothesis(verdict: AnalystVerdict): Hypothesis {
  const worstMetric = verdict.verdict.worst_metric;
  const possibleImpacts = METRIC_TO_IMPACT[worstMetric];

  // Фильтруем уже попробованные
  const untried = possibleImpacts.filter(
    imp => !wasRecentlyTried(imp.impact, history)
  );

  // Выбираем с наибольшим ожидаемым эффектом
  const best = untried.sort((a, b) =>
    effectScore(b.effect) - effectScore(a.effect)
  )[0];

  return {
    impact: best.impact,
    direction: best.direction,
    confidence: untried.length > 2 ? 'high' : 'medium',
    trade_off: best.trade_off
  };
}
```

### 3.3. Change Calculator

**Задача:** определить конкретное новое значение импакта.

```typescript
interface ChangeCalculator {
  calculate(
    impact: string,
    direction: 'increase' | 'decrease',
    currentValue: any,
    constraints: ImpactConstraints
  ): ProposedChange;
}

function calculateChange(
  impact: string,
  direction: string,
  current: number
): ProposedChange {
  // Ограничение ±20%
  const maxChange = current * 0.20;

  const delta = direction === 'increase' ? maxChange : -maxChange;
  const proposed = current + delta;

  // Проверяем границы из constraints
  const bounded = Math.max(
    constraints.min,
    Math.min(constraints.max, proposed)
  );

  return {
    current,
    proposed: bounded,
    change_percent: ((bounded - current) / current) * 100
  };
}
```

### 3.4. History Checker

**Задача:** проверить, не повторяем ли мы прошлые неудачные попытки.

```typescript
interface HistoryChecker {
  wasRecentlyTried(impact: string, cycles: number): boolean;
  wasRolledBack(impact: string, value: any): boolean;
  getLastResult(impact: string): HypothesisResult | null;
}

function wasRecentlyTried(impact: string, history: HypothesisRecord[]): boolean {
  const recent = history.filter(h =>
    h.impact === impact &&
    h.created_at > daysAgo(7) &&
    h.status !== 'rejected'
  );
  return recent.length > 0;
}
```

### 3.5. Recommendation Formatter

**Задача:** собрать всё в формат для Tuner.

```typescript
interface RecommendationFormatter {
  format(
    hypothesis: Hypothesis,
    change: ProposedChange,
    verdict: AnalystVerdict
  ): ChangeRequest;
}
```

---

## 4. Жизненный цикл работы Teacher

```
1. Получить verdict от Analyst (через Manager)
       ↓
2. Определить worst_metric
       ↓
3. Найти связанные импакты в Knowledge Base
       ↓
4. Проверить историю
   • Что уже пробовали?
   • Откуда откатывались?
       ↓
5. Выбрать лучший кандидат
       ↓
6. Вычислить новое значение
   • В пределах ±20%
   • В пределах constraints
       ↓
7. Сформировать hypothesis
       ↓
8. Сформировать change_request
       ↓
9. Отправить Manager'у → Tuner
       ↓
10. Записать hypothesis в историю
```

---

## 5. Артефакты и таблицы

### 5.1. Таблица hypothesis_history

```sql
CREATE TABLE hypothesis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Гипотеза
  hypothesis_id TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT,
  confidence TEXT,  -- 'low' | 'medium' | 'high'

  -- Связь с verdict
  verdict_id UUID REFERENCES analysis_verdicts(id),
  target_metric TEXT NOT NULL,

  -- Предложенное изменение
  impact_key TEXT NOT NULL,
  current_value JSONB,
  proposed_value JSONB,
  change_percent NUMERIC,

  -- Результат (заполняется после эксперимента)
  status TEXT DEFAULT 'pending',  -- 'pending' | 'applied' | 'confirmed' | 'rejected' | 'rolled_back'
  actual_effect JSONB,
  resolved_at TIMESTAMPTZ
);
```

---

## 6. Инварианты и правила

1. **Teacher не анализирует данные напрямую**
   * Работает только с verdict от Analyst
   * Не делает SQL запросов к sensor_events

2. **Один импакт за раз**
   * Для изоляции эффекта
   * Если нужно несколько — в разных циклах

3. **Ограничение ±20%**
   * Без резких изменений
   * Gradual tuning

4. **Проверка истории обязательна**
   * Не повторять недавние неудачи
   * Учитывать rollback'и

5. **Явные trade-offs**
   * Каждая рекомендация указывает риски
   * Manager/Meta-user должен быть в курсе

---

## 7. Метрики качества Teacher

| Метрика | Описание | Target |
|---------|----------|--------|
| **Hypothesis Success Rate** | % гипотез, которые привели к улучшению | > 50% |
| **Recommendation Acceptance** | % рекомендаций, принятых Tuner'ом | > 90% |
| **Cycles to Improvement** | Среднее число циклов до достижения target | < 5 |
| **Rollback Rate** | % изменений, которые пришлось откатить | < 20% |

---

## 8. Связь с другими компонентами

```
ANALYST ──────► verdict ──────► TEACHER
                                    │
                                    ▼
                             change_request
                                    │
                                    ▼
Manager ◄─────────────────────── TEACHER
    │
    ▼
TUNER (применяет изменения)
```

---

## 9. Пример полного flow

```
=== Цикл 1 ===

Analyst verdict:
  worst_metric: precision (0.65 vs target 0.80)
  diagnosis: "top_k слишком большой"

Teacher:
  1. Находит в Knowledge Base: precision ← top_k (decrease)
  2. Проверяет историю: top_k не менялся недавно
  3. Вычисляет: top_k 5 → 4 (−20%)
  4. Формирует hypothesis:
     "Уменьшение top_k с 5 до 4 повысит precision"
  5. Отправляет change_request в Tuner

Результат:
  precision: 0.65 → 0.73 (+8 п.п.)
  recall: 0.72 → 0.70 (−2 п.п., в пределах допуска)

Teacher обновляет hypothesis:
  status: 'confirmed'
  actual_effect: { precision: +0.08, recall: -0.02 }

=== Цикл 2 ===

Analyst verdict:
  worst_metric: precision (0.73 vs target 0.80)
  diagnosis: "top_k уже снижен, попробовать relevance_weight"

Teacher:
  1. top_k уже пробовали → берём следующий кандидат
  2. relevance_weight: 0.5 → 0.6 (+20%)
  ...
```

---

*Последнее обновление: 2025-11-28*
