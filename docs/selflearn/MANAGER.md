# MANAGER — координатор циклов обучения

> **Ключевая задача:** Координировать выполнение Campaign через циклы Emulate → Analyze → Tune.

---

## 0. Позиция в иерархии

```
AGENT (Mission Controller)     ← Получает Mission от пользователя
        │                         Принимает стратегические решения
        │                         Запрашивает approval
        ▼
    MANAGER (Cycle Coordinator) ← Получает Campaign от Agent
        │                         Координирует циклы внутри Campaign
        │                         Оркестрирует суб-агентов
        ▼
  ┌─────┴─────┬──────────┬──────────┐
  │           │          │          │
Emulator  Analyst   Teacher    Tuner
```

### Manager НЕ делает (это уровень Agent)

- ❌ Не получает цели напрямую от пользователя
- ❌ Не принимает стратегические решения о Mission
- ❌ Не запрашивает approval у пользователя
- ❌ Не определяет autonomy level

### Manager ДЕЛАЕТ

- ✅ Получает Campaign от Agent с чёткими targets и constraints
- ✅ Выполняет циклы Emulate → Analyze → Tune
- ✅ Координирует работу Emulator, Analyst, Teacher, Tuner
- ✅ Отчитывается Agent'у о прогрессе Campaign
- ✅ Определяет когда Campaign завершена (targets достигнуты или max_cycles)

---

## 0.1. Схема работы Manager

```
┌─────────────────────────────────────────────────────────────────┐
│                    MANAGER (Cycle Coordinator)                   │
│                                                                  │
│  Input: Campaign { focus_metrics, allowed_impacts, max_cycles }  │
│  State: { current_cycle, metrics_history, decisions_log }        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    LEARNING CYCLE                        │    │
│  │                                                          │    │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐          │    │
│  │   │ Emulator │───►│ Analyst  │───►│ Teacher  │──┐       │    │
│  │   │ (N=30)   │    │ (verdict)│    │(hypothes)│  │       │    │
│  │   └──────────┘    └──────────┘    └──────────┘  │       │    │
│  │        ▲                               │        │       │    │
│  │        │                               ▼        │       │    │
│  │        │                          ┌──────────┐  │       │    │
│  │        │                          │  Tuner   │  │       │    │
│  │        │                          │ (apply)  │  │       │    │
│  │        │                          └────┬─────┘  │       │    │
│  │        │                               │        │       │    │
│  │        └───────────────────────────────┘        │       │    │
│  │                     (repeat until done)         │       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Output: CampaignResult { final_metrics, changes_applied, ... }  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                         ┌─────────┐
                         │  MaaS   │
                         │(Ученик) │
                         └─────────┘
```

---

## 0.2. Входы и выходы Manager

### Вход: Campaign от Agent

```typescript
interface ManagerInput {
  campaign: {
    id: string;
    mission_id: string;
    focus_metrics: string[];       // ['precision', 'recall']
    target_values: TargetMetric[]; // Конкретные targets для этой campaign
    allowed_impacts: string[];     // ['retrieval.top_k', 'retrieval.relevance_weight']
    max_cycles: number;            // 10
    autonomy: 'full_auto' | 'semi_auto';  // Унаследовано от Mission
  };

  // Текущее состояние (из БД)
  current_impacts: ImpactValue[];
  baseline_metrics: MetricSnapshot;
}
```

### Выход: CampaignResult для Agent

```typescript
interface ManagerOutput {
  campaign_id: string;
  status: 'completed' | 'failed' | 'stopped_by_agent';

  // Итоги
  cycles_executed: number;
  final_metrics: MetricSnapshot;
  improvements: {
    metric: string;
    before: number;
    after: number;
    delta: number;
  }[];

  // Изменения
  changes_applied: {
    impact_key: string;
    from: any;
    to: any;
    cycle: number;
  }[];

  // Для отчёта Agent'у
  summary: string;
  recommendations_for_next_campaign: string[];
}
```

---

## 0.3. Логика принятия решений о тюнинге

> **Gap = Target - Current** — основа для принятия решений

Manager получает targets из Campaign. Его задача — определить, продолжать ли цикл.

```typescript
interface MetricGap {
  metric: string;
  target: number;
  current: number;
  gap: number;          // target - current (или current - target для "меньше лучше")
  threshold: number;
  exceeds_threshold: boolean;
  priority: 'critical' | 'primary' | 'secondary';
}

function shouldContinueCycle(gaps: MetricGap[], cycleNumber: number, maxCycles: number): CycleDecision {
  // Проверяем лимит циклов
  if (cycleNumber >= maxCycles) {
    return { continue: false, reason: 'max_cycles_reached' };
  }

  // Если все focus_metrics достигли targets — завершаем успешно
  const unmetTargets = gaps.filter(g => g.exceeds_threshold);
  if (unmetTargets.length === 0) {
    return { continue: false, reason: 'all_targets_met' };
  }

  // Если есть critical проблемы — обязательно продолжать
  const criticalGaps = gaps.filter(g => g.priority === 'critical' && g.exceeds_threshold);
  if (criticalGaps.length > 0) {
    return { continue: true, focus: criticalGaps[0].metric };
  }

  // Есть primary проблемы — продолжаем
  const primaryGaps = gaps.filter(g => g.priority === 'primary' && g.exceeds_threshold);
  if (primaryGaps.length > 0) {
    return { continue: true, focus: primaryGaps[0].metric };
  }

  return { continue: false, reason: 'only_secondary_gaps_remaining' };
}
```

---

## 0.4. Оркестрация одного цикла

Manager координирует работу суб-агентов в рамках одного цикла:

```
Manager receives: Campaign from Agent
Manager state: cycle_number, focus_metric
    │
    ├── Step 1: EMULATE (async)
    │       ├── Manager → Emulator: "run N dialogs"
    │       ├── Emulator: Student ↔ Teacher agents
    │       ├── Sensor: writes to sensor_events
    │       └── Emulator → Manager: "batch completed"
    │
    ├── Step 2: ANALYZE (after Step 1)
    │       ├── Manager → Analyst: "analyze batch_id"
    │       ├── Analyst: metrics + LLM-judge + gaps
    │       └── Analyst → Manager: verdict + diagnosis
    │
    ├── Step 3: DECIDE (Manager's own logic)
    │       ├── Manager: shouldContinueCycle()?
    │       │   ├── If targets met → END campaign (success)
    │       │   ├── If max_cycles → END campaign (partial)
    │       │   └── If gaps remain → continue
    │       └── Manager: select focus_metric for tuning
    │
    ├── Step 4: HYPOTHESIZE (if continuing)
    │       ├── Manager → Teacher: "generate hypothesis for {focus_metric}"
    │       └── Teacher → Manager: change_request
    │
    └── Step 5: TUNE (if hypothesis accepted)
            ├── Manager → Tuner: "apply change_request"
            ├── Tuner: validate on Golden → apply/rollback
            └── Manager: increment cycle_number → goto Step 1
```

### State Machine для Campaign

```
┌─────────────┐  start   ┌───────────┐  batch done  ┌────────────┐
│ INITIALIZED │─────────►│ EMULATING │─────────────►│ ANALYZING  │
└─────────────┘          └───────────┘              └─────┬──────┘
                                                          │
       ┌──────────────────────────────────────────────────┤
       │                                                  │
       ▼                                                  ▼
┌─────────────┐         ┌───────────┐  has gaps    ┌───────────┐
│  COMPLETED  │◄────────│  TUNING   │◄─────────────│ DECIDING  │
│ (to Agent)  │ targets └───────────┘              └───────────┘
└─────────────┘   met          │                        │
                               │ applied                │ no gaps
                               ▼                        ▼
                         next cycle              ┌─────────────┐
                         goto EMULATING          │  COMPLETED  │
                                                 └─────────────┘
```

---

## 0.5. Goodhart Protection (координируется Manager)

> Manager координирует Golden validation, но выполняет её Tuner.

### Flow с Golden Dataset

```
Manager → Tuner: "apply change_request"
    │
    ├── Tuner: временно применяет изменение
    ├── Tuner: запускает Analyst на Golden Dataset
    ├── Analyst: возвращает golden_metrics
    ├── Tuner: сравнивает с baseline
    │
    └── Решение:
        ├── IF golden OK → Tuner: finalize change
        └── IF golden BAD → Tuner: rollback + return failure
                            Manager: log failure, continue cycle
```

Manager обрабатывает результат от Tuner:
- `success` → increment cycle, продолжить
- `rollback` → сохранить в hypothesis_history как failed, попробовать другую гипотезу

Подробности валидации см. в [TUNER.md](./TUNER.md) и [GOLDEN_DATASET.md](./GOLDEN_DATASET.md).

---

## 1. Назначение

Manager — это **координатор циклов обучения**, который:

* получает **Campaign от Agent** с конкретными targets и constraints;
* оркестрирует работу **Emulator, Analyst, Teacher, Tuner**;
* управляет **жизненным циклом циклов** (Emulate → Analyze → Tune);
* **отчитывается Agent'у** о прогрессе и результатах Campaign;
* определяет **когда Campaign завершена** (targets достигнуты или max_cycles).

Manager **не** оценивает качество (это Analyst), **не** генерирует гипотезы (это Teacher), **не** трогает параметры напрямую (это Tuner). Его зона — координация цикла.

---

### 1.1. Границы ответственности

**Manager ДЕЛАЕТ:**

* получает Campaign от Agent с targets, constraints, allowed_impacts;
* оркестрирует цикл: Emulator → Analyst → Teacher → Tuner;
* принимает тактические решения (продолжать цикл или завершить);
* ведёт историю циклов и изменений в рамках Campaign;
* формирует CampaignResult для Agent'а.

**Manager НЕ ДЕЛАЕТ:**

* ❌ не получает цели от пользователя — это Agent;
* ❌ не принимает стратегические решения — это Agent;
* ❌ не запрашивает approval у пользователя — это Agent;
* ❌ не вычисляет метрики — это Analyst;
* ❌ не генерирует гипотезы — это Teacher;
* ❌ не применяет изменения напрямую — это Tuner.

---

### 1.2. Интерфейсы (входы/выходы)

#### Входы от Agent

```typescript
interface CampaignAssignment {
  campaign: Campaign;           // focus_metrics, targets, allowed_impacts, max_cycles
  baseline_metrics: MetricSnapshot;
  current_impacts: ImpactValue[];
}
```

#### Входы от суб-агентов

* **от Emulator:**
  * batch_id — идентификатор завершённого batch диалогов
  * status: 'completed' | 'failed'

* **от Analyst:**
  * verdict — метрики, gaps, worst_metric, diagnosis

* **от Teacher:**
  * change_request — гипотеза с предлагаемым изменением

* **от Tuner:**
  * apply_result: 'success' | 'rollback' | 'error'

#### Выходы к Agent

```typescript
interface CampaignResult {
  campaign_id: string;
  status: 'completed' | 'failed' | 'stopped';
  cycles_executed: number;
  final_metrics: MetricSnapshot;
  changes_applied: ChangeRecord[];
  summary: string;
}
```

#### Выходы к суб-агентам

* **к Emulator:** `{ action: 'run', scenarios: string[], count: number }`
* **к Analyst:** `{ action: 'analyze', batch_id: string }`
* **к Teacher:** `{ action: 'hypothesize', verdict: Verdict, focus_metric: string }`
* **к Tuner:** `{ action: 'apply', change_request: ChangeRequest }`

---

### 1.3. Внутренняя структура Manager

Manager состоит из следующих подмодулей:

1. **Cycle Controller**
   * Управляет текущим состоянием цикла (EMULATING → ANALYZING → DECIDING → TUNING)
   * Определяет переходы между состояниями
   * Инкрементирует cycle_number

2. **Sub-Agent Dispatcher**
   * Отправляет команды суб-агентам
   * Собирает результаты
   * Обрабатывает ошибки и таймауты

3. **Decision Maker**
   * Логика shouldContinueCycle()
   * Выбор focus_metric для следующего цикла
   * Определение когда Campaign завершена

4. **Cycle History Logger**
   * Записывает каждый цикл: inputs, outputs, decisions
   * Хранит историю изменений в рамках Campaign
   * Формирует данные для CampaignResult

5. **Progress Reporter**
   * Формирует промежуточные отчёты для Agent'а
   * Отслеживает прогресс к targets
   * Сигнализирует о проблемах (stuck, degradation)

---

### 1.4. Основные сценарии работы Manager

#### Сценарий 1: Получение Campaign от Agent

1. Agent отправляет Campaign с targets, allowed_impacts, max_cycles.
2. Manager:
   * Сохраняет Campaign в состояние
   * Инициализирует cycle_number = 0
   * Запускает первый цикл (Emulate)

#### Сценарий 2: Выполнение цикла

1. **Emulate:** Manager → Emulator: запустить N диалогов
2. **Analyze:** Manager → Analyst: проанализировать batch
3. **Decide:** Manager: оценить gaps, решить продолжать ли
4. **Hypothesize:** Manager → Teacher: сгенерировать гипотезу
5. **Tune:** Manager → Tuner: применить изменение
6. Increment cycle_number, goto step 1

#### Сценарий 3: Завершение Campaign (успех)

1. Analyst возвращает verdict с gaps = 0 (все targets достигнуты)
2. Manager:
   * Формирует CampaignResult с status: 'completed'
   * Отправляет Agent'у
   * Очищает состояние

#### Сценарий 4: Завершение Campaign (max cycles)

1. cycle_number >= max_cycles
2. Manager:
   * Формирует CampaignResult с status: 'completed' и текущими метриками
   * Добавляет recommendations_for_next_campaign
   * Отправляет Agent'у

#### Сценарий 5: Обработка rollback от Tuner

1. Tuner возвращает apply_result: 'rollback'
2. Manager:
   * Сохраняет hypothesis как 'rolled_back' в истории
   * Запрашивает у Teacher альтернативную гипотезу
   * Если гипотезы закончились → сообщает Agent'у о проблеме

---

### 1.5. Артефакты Manager

| Артефакт | Уровень | Описание |
|----------|---------|----------|
| `campaign_runs` | Campaign | Запись о выполнении Campaign (статус, cycles, results) |
| `cycle_history` | Cycle | История каждого цикла (verdict, hypothesis, outcome) |
| `manager_decisions` | Cycle | Логи решений Manager (continue, stop, focus_metric) |

**Примечание:** Стратегические артефакты (missions, campaigns, approvals) хранятся на уровне Agent. См. [AGENT.md](./AGENT.md).

---

### 1.6. Метрики качества Manager

| Метрика | Описание | Target |
|---------|----------|--------|
| **Cycle Time** | Среднее время одного цикла (Emulate → Tune) | < 5 min |
| **Campaign Success Rate** | % campaigns достигших всех targets | > 60% |
| **Avg Cycles to Target** | Среднее число циклов до достижения targets | < 5 |
| **Decision Quality** | % решений о продолжении/остановке, подтверждённых ретроспективно | > 80% |

---

### 1.7. Риски Manager

| Риск | Описание | Митигация |
|------|----------|-----------|
| Scope creep | Manager начинает принимать стратегические решения | Чёткое разграничение: стратегия → Agent, тактика → Manager |
| Бесконечный цикл | gaps никогда не закрываются | max_cycles ограничение от Agent |
| Потеря контекста | При рестарте теряется состояние | Персистентное хранение cycle_history |
| Блокировка | Один суб-агент не отвечает | Таймауты + fallback логика |

---

## 2. Связь с другими компонентами

```
AGENT ─────► Campaign ─────► MANAGER
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
       EMULATOR            ANALYST             TEACHER
            │                   │                   │
            │                   ▼                   │
            │              verdict                  │
            │                   │                   │
            │                   └───────► change_request
            │                                      │
            │                                      ▼
            │                                   TUNER
            │                                      │
            └──────────────────────────────────────┘
                                │
                                ▼
                         CampaignResult
                                │
                                ▼
                             AGENT
```

---

*Последнее обновление: 2025-11-28*
*Рефакторинг: Manager как Cycle Coordinator (уровень Sub-Agent), получает Campaign от Agent*
