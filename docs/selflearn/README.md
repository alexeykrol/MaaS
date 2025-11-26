# Self-Learning System

> Система автоматически крутит параметры (IMPACTS.md) на основе метрик (METRICS.md).

---

## Философия

> Основная цель системы — постоянное самообучение.
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

## Архитектура

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

---

## Компоненты

| Компонент | Файл | Что делает | Документация |
|-----------|------|------------|--------------|
| **Scheduler** | `[NEW] src/selflearn/scheduler.ts` | Idle detection, запуск циклов | [CYCLES.md](./CYCLES.md) |
| **Evaluator** | `[NEW] src/selflearn/evaluator.ts` | Прогон тестов, метрики | [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) |
| **Optimizer** | `[NEW] src/selflearn/optimizer.ts` | A/B решения, rollback | [AUTONOMY.md](./AUTONOMY.md) |

---

## Артефакты

| Артефакт | Тип | Статус | Документация |
|----------|-----|--------|--------------|
| `experiment_parameters` | Таблица БД | Существует | [AUTONOMY.md](./AUTONOMY.md) |
| `telemetry_events` | Таблица БД | Существует | [CYCLES.md](./CYCLES.md) |
| `test_dialogs` | Таблица БД | Существует | [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) |
| `[NEW] prompts/llm_judge.md` | Файл промптов | Планируется | [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) |
| `[NEW] src/utils/llmJudge.ts` | Модуль | Планируется | [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) |

---

## Тематические документы

| Файл | Отвечает на вопрос |
|------|-------------------|
| [CYCLES.md](./CYCLES.md) | **Когда** запускать обучение (micro/macro/deep циклы) |
| [EXPERIMENTS.md](./EXPERIMENTS.md) | **Как** проводить A/B тесты |
| [AUTONOMY.md](./AUTONOMY.md) | **Что** можно менять автоматически vs вручную |
| [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) | **Чем** тестировать (golden dataset, LLM-judge) |

---

## Связь с другими документами

| Документ | Отвечает на вопрос |
|----------|-------------------|
| [IMPACTS.md](../../IMPACTS.md) | **Что** можем менять (артефакты, параметры) |
| [METRICS.md](../../METRICS.md) | **Как** измеряем качество (формулы, targets) |
| **docs/selflearn/** | **Когда и кто** меняет параметры |

---

## Реализация (фазы)

| Фаза | Описание | Статус |
|------|----------|--------|
| Phase 1 | Telemetry Foundation | [ ] |
| Phase 2 | Golden Dataset (50+ примеров) | [ ] |
| Phase 3 | LLM-Judge | [ ] |
| Phase 4 | Experiment Framework | [ ] |
| Phase 5 | Scheduler | [ ] |
| Phase 6 | Optimizer | [ ] |

---

## Открытые вопросы

1. **Как определять idle?** — По времени последнего запроса? По расписанию?
2. **Кто принимает решения?** — Rules-based? LLM-agent? Human-in-the-loop?

---

*Последнее обновление: 2025-11-26*
