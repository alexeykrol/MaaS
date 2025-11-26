Дам как законченный кусок, который можно вставить в отдельный `TEACHER.md` или в раздел про роли.

---

# TEACHER — роль Учителя / Исследователя

## 0. Краткое определение

**Учитель (Teacher / Evaluator / Researcher / Analyst)** — это модуль, который:

* **оценивает качество работы MaaS** по формальным метрикам и через LLM-оценки;
* **формулирует и проверяет гипотезы** о том, какие импакт-факторы нужно менять;
* **выдаёт формальные рекомендации** для Настройщика и Менеджера в виде машинно-читаемых действий.

Учитель **никогда сам не меняет параметры** MaaS и не ходит в прод напрямую. Он работает поверх телеметрии и экспериментальных запусков.

---

## 1. Зона ответственности и границы

### 1.1. Что делает Учитель

1. **Читает данные:**

   * телеметрию (`telemetry_events`, `pipeline_runs`);
   * golden dataset + симуляторные сессии;
   * текущие и прошлые параметры (`experiment_parameters`);
   * историю экспериментов (`experiment_results`).

2. **Считает и интерпретирует метрики:**

   * primary: precision, recall, context utilization, hallucination rate;
   * secondary: latency, token cost, error rate;
   * diagnostic: hit rate, memory age, распределения по категориям задач.

3. **Проектирует эксперименты:**

   * выбирает, какие параметры варьировать;
   * задаёт baseline и варианты;
   * формулирует success-criteria и границы допустимых побочек.

4. **Анализирует результаты:**

   * сравнивает baseline vs variants;
   * применяет статистические критерии (t-test, пороги дельты, p-value);
   * выявляет trade-offs (precision↑, recall↓ и т.п.).

5. **Формирует рекомендации:**

   * «что поменять» (`param`, `from`, `to`);
   * «зачем» (основание: конкретные метрики/эксперимент);
   * «как откатывать» (rollback-условия).

### 1.2. Чего Учитель НЕ делает

* **Не** пишет в `experiment_parameters` — это задача Настройщика.
* **Не** отвечает за запуск симулятора — это зона Менеджера.
* **Не** общается с мета-пользователем напрямую — только через Менеджера.
* **Не** придумывает цель обучения — только оптимизирует под заданную функцию качества и constraints.

---

## 2. Входы и выходы модуля Учителя

### 2.1. Входы

1. **Experiment Request** (от Менеджера):

```json
{
  "experiment_id": "top_k_precision_recall_v1",
  "goal": {
    "primary_metrics": ["retrieval_precision", "retrieval_recall"],
    "constraints": ["latency_p95", "token_cost"],
    "targets": {
      "retrieval_precision": { "direction": "increase", "min_delta": 0.05 },
      "retrieval_recall": { "direction": "no_large_drop", "max_delta": -0.03 }
    }
  },
  "allowed_impacts": ["retrieval.top_k", "llm.temperature", "system_prompt_version"]
}
```

2. **Telemetry & Metrics:**

   * сырые записи `telemetry_events`, `pipeline_runs`;
   * агрегаты по метрикам (SQL-view или materialized views).

3. **Параметры и история:**

   * активная конфигурация (`experiment_parameters WHERE is_active = true`);
   * прошлые версии параметров и их эффекты (`experiment_results`, change log).

4. **LLM-Judge Prompts:**

   * промпты для оценки relevance/context/hallucinations из `SELFLEARN / LLM-Judge`.

---

### 2.2. Выходы

1. **Experiment Design** (для Менеджера и Настройщика):

```json
{
  "type": "experiment_spec",
  "experiment_id": "top_k_3_vs_2_temp_0_7",
  "variants": [
    { "name": "baseline", "params": { "retrieval.top_k": 3, "llm.temperature": 0.7 } },
    { "name": "variant",  "params": { "retrieval.top_k": 2, "llm.temperature": 0.7 } }
  ],
  "assignment": {
    "mode": "by_example",
    "split": [0.5, 0.5]
  },
  "success_criteria": [
    {
      "metric": "retrieval_precision",
      "direction": "increase",
      "min_delta": 0.05,
      "p_value_threshold": 0.05
    },
    {
      "metric": "retrieval_recall",
      "direction": "no_large_drop",
      "max_delta": -0.03
    }
  ]
}
```

2. **Experiment Evaluation Result**:

```json
{
  "experiment_id": "top_k_3_vs_2_temp_0_7",
  "status": "completed",
  "verdict": "winner", // | "loser" | "inconclusive"
  "metrics": {
    "baseline": {
      "retrieval_precision": 0.68,
      "retrieval_recall": 0.72,
      "latency_p95": 4800
    },
    "variant": {
      "retrieval_precision": 0.77,
      "retrieval_recall": 0.70,
      "latency_p95": 4900
    }
  },
  "p_values": {
    "retrieval_precision": 0.01,
    "retrieval_recall": 0.20
  },
  "notes": "precision вырос на 9 п.п. при статистически незначимом падении recall"
}
```

3. **Recommendations for Tuner** (через Менеджера):

```json
{
  "action": "update_params",
  "experiment_id": "top_k_3_vs_2_temp_0_7",
  "reason": "precision↑ на 9 п.п., падение recall в пределах допусков",
  "changes": [
    { "param": "retrieval.top_k", "from": 3, "to": 2 }
  ],
  "rollback_conditions": {
    "retrieval_precision": { "delta_threshold": -0.10, "cycles": 3 },
    "hallucination_rate": { "delta_threshold": +0.05, "cycles": 2 }
  }
}
```

4. **Hypothesis Registry Updates:**

   * статус гипотез (подтвeрждена/опровергнута);
   * «куда копать дальше» (следующие эксперименты).

---

## 3. Внутренняя структура Учителя

На уровне реализации Учителя разумно разделить на несколько подмодулей.

### 3.1. Metrics Aggregator

**Задача:** привести сырую телеметрию к виду «метрики по вариантам».

* Группирует `telemetry_events` по:

  * `experiment_id`,
  * `variant`,
  * категориям запросов (factual/preference/temporal и т.д.).
* Считает:

  * средние/процентили по latency, cost;
  * долю успешных retrieval;
  * precision/recall по golden-dataset;
  * hallucination_rate, context_utilization из LLM-judge полей.

**Интерфейс:**

```ts
type AggregatedMetrics = {
  variant: string;
  sample_size: number;
  metrics: Record<string, number>;
};

async function getAggregatedMetrics(experimentId: string): Promise<AggregatedMetrics[]> { ... }
```

---

### 3.2. Judge Orchestrator (LLM-оценка)

**Задача:** запускать LLM-judge там, где нужны качественные оценки.

* Выбирает подмножество сессий/шагов для глубокой проверки.
* Вызывает LLM с промптами:

  * Retrieval Relevance Judge;
  * Context Utilization Judge;
  * Hallucination Detection Judge.
* Записывает результаты обратно в `telemetry_events` (или отдельную таблицу).

**Критичный момент:**
LLM-judge **не должен подменять SQL-метрики**, он дополняет их (особенно по hallucinations и context usage).

---

### 3.3. Experiment Designer

**Задача:** на основе запроса от Менеджера придумать «разумный» эксперимент.

* Выбирает подмножество параметров из `allowed_impacts`.
* Опирается на:

  * текущие значения параметров;
  * допустимые диапазоны (из IMPACTS / границы автономии);
  * историю прошлых экспериментов (чтобы не гонять одно и то же).

**Выход:** `experiment_spec`, понятный Симулятору и Настройщику.

---

### 3.4. Result Analyzer / Statistician

**Задача:** понять, есть ли реальный эффект от изменения.

* Проверяет, достаточно ли данных (`MIN_SAMPLES_PER_VARIANT`).
* Считает дельты по ключевым метрикам baseline vs variant.
* Применяет статистический тест (минимум two-sample t-test или z-test).
* Сравнивает с success-criteria, заданными при дизайне эксперимента.

**Интерфейс:**

```ts
type MetricComparison = {
  metric: string;
  baseline: number[];
  variant: number[];
  delta: number;
  pValue: number;
  passes: boolean;
};

function compareMetrics(
  baseline: number[],
  variant: number[],
  spec: SuccessCriterion
): MetricComparison { ... }
```

---

### 3.5. Hypothesis Manager

**Задача:** хранить и обновлять «карту гипотез».

* Каждая гипотеза: «если подвигать X → Y, то улучшится Z при ограничениях W».
* Для каждой гипотезы:

  * статус: `planned`, `running`, `confirmed`, `rejected`, `inconclusive`;
  * ссылки на эксперименты и результаты;
  * предложение следующих шагов (усилить/ослабить эффект, попробовать другие параметры).

Это нужно, чтобы система не бегала по кругу и чтобы мета-пользователь видел, *что именно* уже проверено.

---

### 3.6. Recommendation Generator

**Задача:** собрать всё вышеописанное в конкретное действие.

* Принимает:

  * `AggregatedMetrics` по вариантам;
  * вывод Statistician;
  * контекст цели эксперимента и ограничений.
* Решает:

  * `winner` / `loser` / `inconclusive`;
  * есть ли смысл менять параметры;
  * какие поставить rollback-правила.
* Выдаёт строго формализованный JSON для Настройщика.

---

## 4. Жизненный цикл работы Учителя в одном эксперименте

1. **Получить Experiment Request** от Менеджера.
2. **Спроектировать Experiment Spec**:

   * выбрать параметры и их значения;
   * прописать success-criteria.
3. **Отдать Spec Менеджеру / Настройщику** (для подготовки параметров и запуска Sim Runner).
4. **Ждать завершения эксперимента** (фактически — появления достаточной телеметрии).
5. **Считать AggregatedMetrics**:

   * baseline vs variant;
   * отдельно по категориям задач (если нужно).
6. **Запустить Judge Orchestrator** (по подвыборке шагов).
7. **Прогнать Result Analyzer**:

   * дельты, p-value, соответствие success-criteria.
8. **Сформировать Recommendation**:

   * какие изменения рекомендованы;
   * какие rollback-условия;
   * статус гипотезы.
9. **Отдать Recommendation Менеджеру** и записать в `experiment_results`.

---

## 5. Основные артефакты и таблицы Учителя

Минимум нужны:

1. **`experiment_results`** — итог по эксперименту:

```sql
CREATE TABLE experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verdict TEXT, -- 'winner' | 'loser' | 'inconclusive'
  metrics_baseline JSONB,
  metrics_variant JSONB,
  p_values JSONB,
  recommendation JSONB, -- тот самый action/update_params/rollback_conditions
  notes TEXT
);
```

2. **`experiment_hypotheses`** — реестр гипотез:

```sql
CREATE TABLE experiment_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  description TEXT,
  status TEXT, -- 'planned' | 'running' | 'confirmed' | 'rejected' | 'inconclusive'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  related_experiments TEXT[],
  tags TEXT[]
);
```

---

## 6. Инварианты и правила для Учителя

Чтобы он не начал творить магию:

1. **Источник истины — SQL-метрики.**

   * Любой вывод должен ссылаться на конкретные числа/агрегаты.

2. **LLM-judge — вторичный источник.**

   * Judge помогает там, где SQL не может (hallucination severity, контекст-использование), но не отменяет чисел.

3. **Никаких прямых записей в параметры.**

   * Учитель никогда не вызывает `activate_parameter_version()` и не пишет в `experiment_parameters`.

4. **Все решения — реплицируемы.**

   * Любую рекомендацию можно воспроизвести, имея:

     * `experiment_spec`,
     * снапшот телеметрии,
     * код аналитики.

5. **Явное указание trade-offs.**

   * Любая рекомендация должна явно описывать:

     * что выиграли,
     * чем пожертвовали,
     * почему это считается приемлемым.

---

## 7. Метрики качества самого Учителя

Чтобы потом не спорить «он помогает или мешает»:

* **Experiment Yield:** доля экспериментов, по которым получен «winner» с понятным эффектом (не `inconclusive`).
* **Regression Catch Rate:** сколько деградаций качества было обнаружено учителем до того, как они ударили по реальным пользователям.
* **Hypothesis Resolution Time:** среднее время от постановки гипотезы до чёткого verdict.
* **Stability:** нет ли постоянных качелей «вперёд-назад» по одним и тем же параметрам без улучшения глобальных метрик.

---

## 8. Основные риски / слабые места

Кратко, чтобы разработка сразу держала это в голове:

1. **Учитель сам может «галлюцинировать»**, особенно в части объяснений. Поэтому:

   * всё важное должно опираться на SQL-агрегаты;
   * любые текстовые выводы — только как комментарий, не как источник истины.

2. **Риск переоптимизации под golden-dataset/симулятор.**

   * Нужна регулярная сверка offline-результатов с online-метриками.

3. **Сложность/хрупкость статистики.**

   * При маленьких выборках t-test даёт мусор;
   * нужно жёстко контролировать `MIN_SAMPLES_PER_VARIANT` и не доверять «красивым» p-values на 10 запросах.

---

Если нужно, дальше можно сделать «узкую» ТЗ-версию: список функций/ендпоинтов для Teacher-сервиса (`POST /experiments/plan`, `POST /experiments/evaluate`, `GET /experiments/:id/results`) и конкретные типы данных в TS.
