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

### Retrieval Parameters

| Параметр | Описание | Диапазон | Текущее |
|----------|----------|----------|---------|
| `top_k` | Количество memories для контекста | 1-10 | 3 |
| `keyword_count` | Сколько keywords извлекать | 3-10 | 5 |
| `relevance_weight` | Вес релевантности vs recency | 0.0-1.0 | 0.5 |
| `recency_weight` | Вес свежести | 0.0-1.0 | 0.5 |
| `min_tag_overlap` | Минимум совпадающих тегов | 1-3 | 1 |

### Context Assembly

| Параметр | Описание | Диапазон | Текущее |
|----------|----------|----------|---------|
| `max_context_tokens` | Лимит токенов контекста | 1000-8000 | 4000 |
| `memory_order` | Порядок memories | chronological/relevance | relevance |
| `include_metadata` | Показывать теги/даты | true/false | true |

### LLM Settings

| Параметр | Описание | Диапазон | Текущее |
|----------|----------|----------|---------|
| `model` | Модель для ответа | mini/4o | mini |
| `temperature` | Креативность | 0.0-1.0 | 0.7 |
| `system_prompt` | Инструкции для LLM | text | default |

### Archivist Settings

| Параметр | Описание | Диапазон | Текущее |
|----------|----------|----------|---------|
| `max_tags` | Максимум тегов на memory | 3-10 | 5 |
| `summary_length` | Длина summary | short/medium/long | medium |
| `archival_threshold` | Минимальная значимость | 0.0-1.0 | 0.0 |

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

- [IDEAS.md](./IDEAS.md) — идеи для улучшения (input для экспериментов)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — текущая архитектура
- [Test/TEST_REGISTRY.md](./Test/TEST_REGISTRY.md) — существующие тесты

---

## Вопросы для обсуждения

1. **Как определять idle?**
   - По времени последнего запроса?
   - По расписанию (ночью)?
   - По нагрузке на систему?

2. **Кто принимает решения?**
   - Автоматика (rules-based)?
   - LLM-agent?
   - Human-in-the-loop для критичных изменений?

3. **Как откатывать?**
   - Версионирование параметров?
   - Снапшоты конфигурации?

4. **Границы автономии?**
   - Что система может менять сама?
   - Что требует подтверждения?

---

*Этот файл — living document для развития самообучающейся системы*
