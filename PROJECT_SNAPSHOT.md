# PROJECT SNAPSHOT — Текущее состояние проекта

*Последнее обновление: 2025-11-28*

> **Процесс обновления этого файла:** см. [`PROCESS.md`](./PROCESS.md)
>
> **ВАЖНО:** Обновляй этот файл после завершения КАЖДОГО шага!

---

## Статус разработки

**Phase 1: Core Infrastructure** ✅ COMPLETED
**Phase 2: Real Implementations** ✅ COMPLETED
**Phase 3: Polish** ✅ COMPLETED

**Общий прогресс:** 100% (12/12 шагов MVP) 🎉

**Статус:** MVP ЗАВЕРШЁН

---

## Установленные зависимости

### Production:
- `pg` ^8.11.3 - PostgreSQL client
- `dotenv` ^16.3.1 - Environment variables
- `express` ^4.18.2 - HTTP server
- `openai` ^4.20.1 - OpenAI API client
- `uuid` ^9.0.1 - UUID generation

### Development:
- `typescript` ^5.3.3
- `ts-node` ^10.9.2
- `@types/node` ^20.10.5
- `@types/express` ^4.17.21
- `@types/pg` ^8.10.9
- `@types/uuid` ^9.0.7

---

## Структура проекта

```
MaaS2/
├── src/
│   ├── agents/                    ✅ Steps 4-8
│   │   └── index.ts               ✅ Analyzer, Assembler, FinalResponder
│   ├── orchestrator/              ✅ Step 3
│   │   └── index.ts               ✅ LISTEN/NOTIFY + routing
│   ├── test-runner/               ✅ Step 2
│   │   ├── engine.ts              ✅
│   │   ├── api.ts                 ✅
│   │   └── cli.ts                 ✅
│   ├── utils/
│   │   ├── db.ts                  ✅ Step 0
│   │   ├── logger.ts              ✅ Step 5
│   │   └── openai.ts              ✅ Step 8
│   ├── server.ts                  ✅ Step 2
│   ├── main.ts                    ✅ Step 3
│   ├── test-connection.ts         ✅ Step 0
│   ├── test-notify.ts             ✅ Step 3
│   └── test-pipeline.ts           ✅ Step 3
├── db/
│   ├── schema.sql                 ✅ Step 1
│   ├── seeds.sql                  ✅ Step 1
│   └── run-migrations.ts          ✅ Step 1
├── public/
│   └── test-runner/
│       └── index.html             ✅ Step 2
├── Test/                          ✅ Test Framework
│   ├── TEST_REGISTRY.md           ✅ Реестр всех тестов
│   ├── TEST_LOG.md                ✅ История выполнения
│   └── scenarios/                 ✅ Детальные сценарии
│       ├── db-connection.md       ✅ Step 0
│       ├── schema-seeds.md        ✅ Step 1
│       ├── test-runner.md         ✅ Step 2
│       ├── orchestrator.md        ✅ Step 3
│       ├── agents.md              ✅ Step 4
│       ├── logger.md              ✅ Step 5
│       ├── analyzer.md            ✅ Step 6
│       ├── assembler.md           ✅ Step 7
│       ├── final-responder.md     ✅ Step 8
│       └── archivist.md           ⏳ Step 9
├── dist/                          ✅ (compiled)
├── .env                           ✅ Configured
├── .env.example                   ✅
├── package.json                   ✅
├── tsconfig.json                  ✅
├── docs/
│   └── selflearn/                 ✅ Self-Learning System docs
│       ├── README.md              ✅ Overview + two-level architecture
│       ├── AGENT.md               ✅ Mission Controller (Agent Level)
│       ├── MANAGER.md             ✅ Cycle Coordinator (Sub-Agent Level)
│       ├── ANALYST.md             ✅ "Что не так?" — metrics, verdict
│       ├── TEACHER.md             ✅ "Как исправить?" — hypotheses
│       ├── TUNER.md               ✅ Parameter management
│       ├── USER EMULATOR.md       ✅ Dialog generation
│       ├── CYCLES.md              ✅ Learning cycles (micro/macro/deep)
│       ├── EXPERIMENTS.md         ✅ A/B testing structure
│       ├── AUTONOMY.md            ✅ Parameter boundaries
│       ├── GOLDEN_DATASET.md      ✅ Golden dataset structure
│       └── Системы и ролей.md     ✅ Roles interaction diagram
├── ARCHITECTURE.md                ✅
├── BACKLOG.md                     ✅
├── PIPELINE.md                    ✅
├── ROADMAP.md                     ✅ Development roadmap (phases)
├── METRICS.md                     ✅ Quality metrics definitions
├── IMPACTS.md                     ✅ Tunable parameters
├── README.md                      ✅
├── CLAUDE.md                      ✅
├── PROJECT_INTAKE.md              ✅
├── PROJECT_SNAPSHOT.md            ✅ (this file)
└── PROCESS.md                     ✅

Легенда:
✅ — реализовано и протестировано
🔄 — в процессе разработки
⏳ — ожидает выполнения
```

---

## Завершенные задачи

### Step 0: Подготовка ✅
1. ✅ Создана структура проекта TypeScript + Node.js
2. ✅ Установлены зависимости (pg, express, openai, dotenv)
3. ✅ Настроен tsconfig.json
4. ✅ Создан db.ts для подключения к Supabase
5. ✅ Проверено подключение к БД

### Step 1: База данных ✅
1. ✅ Создана schema.sql с 6 таблицами
2. ✅ Настроены триггеры LISTEN/NOTIFY
3. ✅ Создан seeds.sql с тестовыми данными
4. ✅ Применены миграции в Supabase

### Step 2: Test Runner ✅
1. ✅ Создан TestRunnerEngine с mock mode
2. ✅ Создан REST API для тестов
3. ✅ Создан Web UI (Terminal aesthetic)
4. ✅ Интегрировано в Express server
5. ✅ Тесты проходят в mock режиме

### Step 3: Orchestrator ✅
1. ✅ Создан `src/orchestrator/index.ts`
2. ✅ Подключение к PostgreSQL через LISTEN 'pipeline_events'
3. ✅ Реагирование на изменения статуса в pipeline_runs
4. ✅ Маршрутизация задач к агентам
5. ✅ Обработка reconnect при обрыве соединения
6. ✅ Создан `src/main.ts` как entry point

### Step 4: Agent Stubs ✅
1. ✅ Созданы базовые структуры агентов
2. ✅ Реализована идемпотентность (захват задачи через UPDATE WHERE status)
3. ✅ Переход статусов работает корректно

### Step 5: Logger ✅
1. ✅ Создан `src/utils/logger.ts`
2. ✅ Поддержка уровней: info, warn, error, debug
3. ✅ Timestamps в ISO формате
4. ✅ JSON форматирование для объектов

### Step 6: Real Analyzer ✅
1. ✅ Извлечение keywords из user_query
2. ✅ Поиск в lsm_storage через semantic_tags (PostgreSQL array overlap)
3. ✅ Возврат до 3 релевантных memories
4. ✅ Сохранение результата в analysis_result

### Step 7: Real Assembler ✅
1. ✅ Чтение analysis_result от Analyzer
2. ✅ Получение recent conversation из raw_logs
3. ✅ Сборка контекста: SYSTEM ROLE + PREVIOUS CONTEXT + RECENT CONVERSATION + CURRENT QUERY
4. ✅ Сохранение в final_context_payload

### Step 8: Real FinalResponder ✅
1. ✅ Создан `src/utils/openai.ts` с createChatCompletion
2. ✅ Вызов OpenAI gpt-4o-mini с контекстом
3. ✅ Сохранение ответа в final_answer
4. ✅ Логирование USER_QUERY и SYSTEM_RESPONSE в raw_logs
5. ✅ Обработка ошибок OpenAI API

---

## Завершённый этап: Step 9 - Archivist ✅

**Archivist Agent (Memory Creator)** — РЕАЛИЗОВАН

### Что сделано:
1. ✅ Создана функция `runArchivist(pipelineId)` в agents/index.ts
2. ✅ Триггер: автоматически после COMPLETED в Orchestrator
3. ✅ Читает raw_logs для конкретного pipeline_run
4. ✅ Суммаризирует диалог через LLM (gpt-4o-mini)
5. ✅ Извлекает semantic_tags через LLM
6. ✅ Записывает summary в lsm_storage
7. ✅ Помечает raw_logs как processed

---

## Завершённый этап: Step 10 - Assembler v2 ✅

**Assembler v2 (с улучшенным LSM)** — РЕАЛИЗОВАН

### Что сделано:
1. ✅ Приоритизация контекста по релевантности (tag overlap scoring)
2. ✅ Приоритизация по свежести (recency scoring)
3. ✅ Лимит токенов для контекста (~4000 токенов)
4. ✅ Использование LSM записей от Archivist

---

## Завершённый этап: Step 11 - Polish ✅

**Error Handling & Cleanup** — РЕАЛИЗОВАНО

### Что сделано:
1. ✅ Retry логика в Orchestrator (до 3 попыток с exponential backoff)
2. ✅ Graceful degradation для Archivist (не блокирует pipeline)
3. ✅ Очистка старого кода (удалена deprecated buildContextString)

---

## Технологии

- **Runtime:** Node.js 18+ + TypeScript 5.3
- **Database:** Supabase (PostgreSQL managed)
- **LLM:** OpenAI API (gpt-4o-mini, gpt-4o)
- **HTTP Server:** Express 4.18
- **Architecture:** Event-Driven (LISTEN/NOTIFY)
- **Pattern:** Blackboard Pattern

---

## Заметки

### Важные файлы конфигурации:
- `.env` — DATABASE_URL, OPENAI_API_KEY, PORT
- `.env.example` — шаблон для .env
- `tsconfig.json` — strict mode, ES2020 target

### Важные документы:
- `ARCHITECTURE.md` — детальная архитектура системы
- `BACKLOG.md` — план разработки по шагам (Phase 1-3)
- `PIPELINE.md` — описание state machine
- `ROADMAP.md` — приоритизированный план развития
- `METRICS.md` — метрики качества системы
- `IMPACTS.md` — настраиваемые параметры
- `docs/selflearn/README.md` — система самообучения (обзор)
- `PROCESS.md` — процесс обновления метафайлов
- `Test/TEST_REGISTRY.md` — реестр всех тестов (34 теста)
- `Test/TEST_LOG.md` — история выполнения тестов

### Команды:
```bash
npm run dev          # Запустить HTTP сервер
npm run orchestrator # Запустить Orchestrator
npm run test-runner  # Запустить Test Runner CLI
npm run build        # Скомпилировать TypeScript
npm run db:test      # Проверить подключение к БД
```

### Безопасность:
- `.env` в `.gitignore` ✅
- Secrets не в коде ✅
- Параметризованные SQL запросы ✅

---

## Цель MVP

Event-Driven AI система с долгосрочной семантической памятью, способная:
- Принимать запросы пользователей
- Анализировать нужен ли контекст из памяти
- Собирать релевантный контекст из LSM
- Генерировать ответы с учетом истории
- Архивировать диалоги в семантическую память

**Ключевые функции MVP:**
- ✅ Database schema (6 tables + triggers)
- ✅ Test Runner (mock mode)
- ✅ Orchestrator (LISTEN/NOTIFY)
- ✅ Real Analyzer (keyword search в LSM)
- ✅ Real Assembler v2 (context building + token limits + prioritization)
- ✅ Real Final Responder (OpenAI calls)
- ✅ Archivist (LLM summarization + LSM creation)
- ✅ Error handling (retry logic + graceful degradation)
- ✅ Polish & documentation

---

## 🔜 Следующий этап: Self-Learning System

> **Философия:** "Make it work, then make it good"
> Сначала все модули минимально работают вместе (E2E), потом улучшаем качество.

### Архитектура: Два уровня

```
AGENT LEVEL (Mission Controller)
    │
    └── Получает Mission от пользователя
        Разбивает на Campaigns
        Запрашивает approval
    │
    ▼
SUB-AGENT LEVEL
    │
    └── MANAGER (Cycle Coordinator)
        │
        └── Emulator → Analyst → Teacher → Tuner → MaaS
```

### Phase 2A: Make it Work (Steps 12-15)

> **Цель:** Один полный цикл обучения работает E2E

| Шаг | Компоненты | Что делаем | Критерий готовности |
|-----|------------|------------|---------------------|
| 12 | DB Schema + Emulator v0 | Таблицы + простая генерация диалогов | 5 диалогов создаются через MaaS |
| 13 | Sensor v0 + Analyst v0 | Съём данных + hit_rate метрика | hit_rate вычисляется, verdict генерируется |
| 14 | Teacher v0 + Tuner v0 | Простая гипотеза + применение параметров | Гипотеза применяется к impact_values |
| 15 | Manager v0 | Оркестрация E2E цикла | Один полный цикл: Emulate→Analyze→Teach→Tune |

### Phase 2B: Make it Good (Steps 16-19)

> **Цель:** Качественные метрики, валидация, стратегия

| Шаг | Компоненты | Что делаем | Критерий готовности |
|-----|------------|------------|---------------------|
| 16 | LLM-Judge + Golden Dataset | Качественная оценка ответов | LLM-Judge работает, Golden Dataset создан |
| 17 | Multi-metric Analyst | Precision, Recall, полноценный verdict | 3+ метрики вычисляются корректно |
| 18 | Smart Teacher + Rollback | Причинно-следственный анализ + валидация | Rollback срабатывает при деградации |
| 19 | Agent | Mission Controller | Mission → Campaigns → Results работает |

**Документация:**
- [docs/selflearn/README.md](./docs/selflearn/README.md) — Overview + two-level architecture
- [docs/selflearn/AGENT.md](./docs/selflearn/AGENT.md) — Agent Level
- [docs/selflearn/MANAGER.md](./docs/selflearn/MANAGER.md) — Sub-Agent Level

---

## История обновлений

### 2025-11-28 - Vertical Slice Approach
- Переструктурирован BACKLOG.md с подходом "Make it work, then make it good"
- **Phase 2A (Make it Work):** Steps 12-15 — минимальные модули, E2E цикл работает
- **Phase 2B (Make it Good):** Steps 16-19 — качество, LLM-Judge, Golden Dataset, rollback
- Каждый шаг включает минимальную v0 версию с конкретными примерами кода
- Обновлён PROJECT_SNAPSHOT.md с новыми фазами

### 2025-11-28 - Two-Level Self-Learning Architecture
- Создан AGENT.md — Mission Controller (стратегический уровень)
- Создан ANALYST.md — "Что не так?" (метрики, verdict, диагноз)
- Обновлён MANAGER.md — Cycle Coordinator (тактический уровень)
- Обновлён TEACHER.md — "Как исправить?" (гипотезы, change_request)
- Обновлён README.md — новая двухуровневая архитектура
- Определена последовательность реализации: DB → Sensor → Analyst → Teacher → Tuner → Emulator → Manager → Agent

### 2025-11-26 - Self-Learning Documentation
- Создана директория `docs/selflearn/` с полной документацией системы самообучения
- Добавлены: MANAGER.md, TEACHER.md, TUNER.md, USER EMULATOR.md, "Системы и ролей.md"
- Создан ROADMAP.md с приоритизированным планом развития
- Обновлены: BACKLOG.md (Phase 2 + Phase 3), CLAUDE.md, PROJECT_SNAPSHOT.md
- Следующий этап: Phase 2 - Measurement Foundation (Telemetry → Golden Dataset → LLM-Judge)

### 2025-11-26 - MVP COMPLETED 🎉
- Steps 10-11 завершены (Assembler v2 + Polish)
- Assembler v2: приоритизация контекста + лимит токенов
- Polish: retry логика + graceful degradation
- Прогресс: 100% (12/12)
- **MVP полностью функционален!**

### 2025-11-26 - Step 9 Archivist завершён
- Реализовано: Archivist agent (LLM summarization + tags extraction)
- Автоматический триггер после COMPLETED
- LSM записи создаются, raw_logs помечаются как processed
- Прогресс: 83% (10/12)
- Следующий этап: Step 10 (Assembler v2)

### 2025-11-25 - Steps 3-8 завершены
- Реализовано: Orchestrator, Logger, все агенты (реальные!)
- OpenAI интеграция работает
- Pipeline полностью функционален (кроме Archivist)
- Прогресс: 75% (9/12)
- Следующий этап: Step 9 (Archivist)

### 2025-11-25 - Step 2 завершен, фреймворк интегрирован
- Реализовано: Test Runner (engine + API + UI)
- Интегрированы метафайлы фреймворка (11 файлов)
- Заполнены PROJECT_INTAKE.md и PROJECT_SNAPSHOT.md

### 2025-11-25 - Step 1 завершен
- Реализовано: Database schema + seeds + migrations

### 2025-11-25 - Step 0 завершен
- Реализовано: Project setup + Supabase connection

---

## Модули и их статус

| Модуль | Статус | Шаг | Зависимости | Тестирование |
|--------|--------|-----|-------------|--------------|
| DB Connection | ✅ Готов | 0 | - | ✅ Passed |
| Schema + Seeds | ✅ Готов | 1 | Step 0 | ✅ Passed |
| Test Runner | ✅ Готов | 2 | Step 1 | ✅ Mock mode |
| Orchestrator | ✅ Готов | 3 | Step 2 | ✅ Tested |
| Agent Stubs | ✅ Готов | 4 | Step 3 | ✅ Tested |
| Logger | ✅ Готов | 5 | Step 4 | ✅ Tested |
| Analyzer | ✅ Готов | 6 | Step 5 | ✅ Keyword search |
| Assembler | ✅ Готов | 7 | Step 6 | ✅ Context building |
| FinalResponder | ✅ Готов | 8 | Step 7 | ✅ OpenAI calls |
| Archivist | ✅ Готов | 9 | Step 8 | ✅ LLM summarization |
| Assembler v2 | ✅ Готов | 10 | Step 9 | ✅ Token limits + prioritization |
| Polish | ✅ Готов | 11 | Step 10 | ✅ Retry logic + cleanup |

---

## Блокеры и проблемы

### Текущие блокеры:
- (нет)

### Решенные проблемы:
- [x] Supabase connection настроена (SSL + connection string)
- [x] Test Runner mock mode работает
- [x] LISTEN/NOTIFY триггеры созданы в БД
- [x] OpenAI интеграция работает
- [x] Pipeline проходит от NEW до COMPLETED

---

*Этот файл — SINGLE SOURCE OF TRUTH для текущего состояния проекта*
*Обновляй после каждого шага согласно PROCESS.md!*
