# Self-Learning System

> Система непрерывного самообучения MaaS через эксперименты с импакт-факторами.

---

## Философия

> Основная цель системы — постоянное самообучение.
> Реальные диалоги с пользователем — лишь разновидность учебных кейсов.

Всё основано на прозрачных метриках: любое решение можно объяснить, повторить и откатить.

---

## Архитектура: Два уровня

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LEVEL                              │
│                   (Mission Controller)                          │
│                                                                 │
│  Мета-пользователь ──Mission──► AGENT ──отчёты──► Пользователь  │
│                                   │                             │
│                            ┌──────┴──────┐                      │
│                            │  Campaign   │                      │
│                            └──────┬──────┘                      │
└───────────────────────────────────┼─────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUB-AGENT LEVEL                            │
│                                                                 │
│                         MANAGER                                 │
│                    (Cycle Coordinator)                          │
│                            │                                    │
│          ┌─────────────────┼─────────────────┐                  │
│          ▼                 ▼                 ▼                  │
│     ┌─────────┐      ┌─────────┐       ┌─────────┐              │
│     │Emulator │      │ Analyst │       │ Teacher │              │
│     └────┬────┘      └────┬────┘       └────┬────┘              │
│          │                │                 │                   │
│          │                ▼                 ▼                   │
│          │           verdict          change_request            │
│          │                │                 │                   │
│          │                └────────┬────────┘                   │
│          │                         ▼                            │
│          │                    ┌─────────┐                       │
│          │                    │  Tuner  │                       │
│          │                    └────┬────┘                       │
│          │                         │                            │
│          ▼                         ▼                            │
│     ┌─────────────────────────────────────────┐                 │
│     │              MaaS (Ученик)              │                 │
│     └─────────────────────────────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Компоненты системы

### Agent Level (стратегия)

| Компонент | Документ | Что делает |
|-----------|----------|------------|
| **Мета-пользователь** | — | Владелец системы, задаёт Mission |
| **Agent** | [AGENT.md](./AGENT.md) | Mission Controller: цели → campaigns, approval, отчёты |

### Sub-Agent Level (тактика)

| Компонент | Документ | Что делает |
|-----------|----------|------------|
| **Manager** | [MANAGER.md](./MANAGER.md) | Координатор циклов, оркестрирует sub-agents |
| **Emulator** | [USER EMULATOR.md](./USER%20EMULATOR.md) | Генерация диалогов (Student ↔ Teacher agents) |
| **Sensor** | — | Читает из MaaS, пишет в `sensor_events` |
| **Analyst** | [ANALYST.md](./ANALYST.md) | "Что не так?" — метрики, verdict, диагноз |
| **Teacher** | [TEACHER.md](./TEACHER.md) | "Как исправить?" — гипотезы, change_request |
| **Tuner** | [TUNER.md](./TUNER.md) | Версионирование параметров, rollback |

### Разделение Analyst / Teacher

| Аспект | Analyst | Teacher |
|--------|---------|---------|
| **Вопрос** | "Что не так?" | "Как исправить?" |
| **Вход** | sensor_events | verdict от Analyst |
| **Выход** | verdict, diagnosis | hypothesis, change_request |
| **Знания** | Формулы метрик | Связи метрика↔импакт |

**Подробная схема взаимодействия:** [Системы и ролей.md](./Системы%20и%20ролей.md)

---

## Цикл обучения

### Общий flow: Mission → Campaign → Cycles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FULL FLOW                                      │
│                                                                          │
│  Пользователь ──Mission──► AGENT ──approval──► Пользователь             │
│                              │                                           │
│                              ▼                                           │
│                         Campaign                                         │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MANAGER (cycles)                              │    │
│  │                                                                  │    │
│  │   Emulator → MaaS → Sensor → Analyst → Teacher → Tuner → MaaS   │    │
│  │        ↑                                                    │    │    │
│  │        └────────────────────────────────────────────────────┘    │    │
│  │                        (repeat until targets met)                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│                       CampaignResult                                     │
│                              │                                           │
│                              ▼                                           │
│                           AGENT                                          │
│                              │                                           │
│                              ▼                                           │
│               Next Campaign OR Mission Complete                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Шаги цикла (внутри Manager)

| Шаг | Что происходит |
|-----|----------------|
| 1 | Agent → Manager: Campaign с targets, constraints, allowed_impacts |
| 2 | Manager → Emulator: запуск эмуляции (N диалогов) |
| 3 | Emulator → MaaS: Student ↔ Teacher agents диалогируют |
| 4 | Sensor ← MaaS: съём данных в `sensor_events` |
| 5 | Manager → Analyst: запрос анализа batch |
| 6 | **Analyst**: вычисление метрик, сравнение с targets, verdict |
| 7 | Manager: проверка gaps → если targets met → завершить Campaign |
| 8 | Manager → Teacher: verdict с диагнозом, запрос гипотезы |
| 9 | **Teacher**: генерация гипотезы, change_request |
| 10 | Manager → Tuner: применение изменений (с валидацией на Golden) |
| 11 | Manager: increment cycle → goto 2 или завершение |
| 12 | Manager → Agent: CampaignResult |

---

## Артефакты

### Agent Level

| Артефакт | Тип | Кто использует |
|----------|-----|----------------|
| `missions` | Таблица БД | Agent пишет/читает |
| `campaigns` | Таблица БД | Agent пишет, Manager читает |
| `agent_decisions` | Таблица БД | Agent пишет (стратегические решения) |
| `approval_requests` | Таблица БД | Agent пишет, Пользователь отвечает |

### Sub-Agent Level

| Артефакт | Тип | Кто использует |
|----------|-----|----------------|
| `sensor_events` | Таблица БД | Sensor пишет, Analyst читает |
| `analysis_verdicts` | Таблица БД | Analyst пишет, Manager/Teacher читают |
| `hypothesis_history` | Таблица БД | Teacher пишет/читает |
| `impact_values` | Таблица БД | Tuner пишет, MaaS читает |
| `parameter_history` | Таблица БД | Tuner пишет, Teacher читает |
| `cycle_history` | Таблица БД | Manager пишет/читает |
| scenarios/ | Файлы | User Emulator (train/validation/golden) |

---

## Тематические документы

### Agent Level

| Файл | Отвечает на вопрос |
|------|-------------------|
| [AGENT.md](./AGENT.md) | Mission Controller: стратегические решения, campaigns, approvals |

### Sub-Agent Level (роли)

| Файл | Отвечает на вопрос |
|------|-------------------|
| [Системы и ролей.md](./Системы%20и%20ролей.md) | Обзор всех ролей и их взаимодействия |
| [MANAGER.md](./MANAGER.md) | Координатор циклов: оркестрация sub-agents |
| [ANALYST.md](./ANALYST.md) | "Что не так?" — метрики, verdict, диагноз |
| [TEACHER.md](./TEACHER.md) | "Как исправить?" — гипотезы, change_request |
| [TUNER.md](./TUNER.md) | Как безопасно менять параметры |
| [USER EMULATOR.md](./USER%20EMULATOR.md) | Как генерировать goal-oriented диалоги |

### Механизмы (как это работает)

| Файл | Отвечает на вопрос |
|------|-------------------|
| [CYCLES.md](./CYCLES.md) | **Когда** запускать обучение (micro/macro/deep) |
| [EXPERIMENTS.md](./EXPERIMENTS.md) | **Как** проводить A/B тесты |
| [AUTONOMY.md](./AUTONOMY.md) | **Что** можно менять автоматически vs вручную |
| [GOLDEN_DATASET.md](./GOLDEN_DATASET.md) | **Чем** тестировать (golden dataset, LLM-judge) |

---

## Интерфейс между MaaS и Self-Learning

Self-Learning взаимодействует с MaaS через две точки:

| Файл | Определяет | Компонент | Направление |
|------|------------|-----------|-------------|
| [METRICS.md](../../METRICS.md) | Что наблюдаем (latency, precision, recall...) | Sensor читает | MaaS → Self-Learning |
| [IMPACTS.md](../../IMPACTS.md) | Что меняем (top_k, temperature, prompts...) | Tuner пишет | Self-Learning → MaaS |

```
MaaS (pipeline_runs, raw_logs, lsm_storage)
        │                           ▲
        │ Sensor читает             │ Tuner пишет
        ▼                           │
   sensor_events               impact_values
        │                           ▲
        ▼                           │
    ANALYST ─────► verdict ─────► TEACHER
   (метрики)                    (гипотезы)
```

---

## Связь с другими документами

| Документ | Отвечает на вопрос |
|----------|-------------------|
| [METRICS.md](../../METRICS.md) | **Что** Sensor читает из MaaS |
| [IMPACTS.md](../../IMPACTS.md) | **Что** Tuner пишет в MaaS |
| **docs/selflearn/** | **Когда, кто и как** меняет параметры |

---

## Реализация (шаги)

| Шаг | Компонент | Что делает | Статус |
|-----|-----------|------------|--------|
| 12 | User Emulator | Генерация диалогов через MaaS | [ ] |
| 13 | Sensor | Съём данных из MaaS в `sensor_events` | [ ] |
| 14 | Teacher | Расчёт метрик, LLM-judge, эксперименты | [ ] |
| 15 | Tuner | Версионирование параметров, rollback | [ ] |
| 16 | Manager | Циклы, цели, отчёты, API | [ ] |

**Детали:** см. [ROADMAP.md](../../ROADMAP.md)

---

*Последнее обновление: 2025-11-28*
*Добавлена двухуровневая архитектура: Agent Level (Mission Controller) → Sub-Agent Level*
