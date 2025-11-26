# PROJECT SNAPSHOT — Текущее состояние проекта

*Последнее обновление: 2025-11-25*

> **Процесс обновления этого файла:** см. [`PROCESS.md`](./PROCESS.md)
>
> **ВАЖНО:** Обновляй этот файл после завершения КАЖДОГО шага!

---

## Статус разработки

**Phase 1: Core Infrastructure** ✅ COMPLETED
**Phase 2: Real Implementations** ✅ COMPLETED (кроме Archivist)
**Phase 3: Polish** ⏳ NOT STARTED

**Общий прогресс:** 75% (9/12 шагов MVP)

**Текущий шаг:** Step 9 - Archivist

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
├── ARCHITECTURE.md                ✅
├── BACKLOG.md                     ✅
├── PIPELINE.md                    ✅
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

## Следующий этап: Step 9 - Archivist

**Archivist Agent (Memory Creator)**

### Задачи:
1. Создать функцию `runArchivist(pipelineId)` в agents/index.ts
2. Триггер: после COMPLETED (или по расписанию)
3. Читать raw_logs за период (или конкретный pipeline_run)
4. Суммаризировать диалог через LLM
5. Извлечь semantic_tags
6. Записать summary в lsm_storage
7. Опционально: пометить raw_logs как archived

### Критерий успеха:
- После завершения диалога в lsm_storage появляется новая запись
- semantic_tags релевантны содержанию диалога
- summary_text содержит ключевую информацию

**Зависимости:** Steps 0-8 (все выполнены)

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
- `BACKLOG.md` — план разработки по шагам
- `PIPELINE.md` — описание state machine
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
- ✅ Real Assembler (context building)
- ✅ Real Final Responder (OpenAI calls)
- ⏳ Archivist (LSM creation) — **NEXT**
- ⏳ Error handling improvements
- ⏳ Polish & documentation

---

## История обновлений

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
| Archivist | ⏳ Ожидает | 9 | Step 8 | ⏳ Pending |
| Assembler v2 | ⏳ Ожидает | 10 | Step 9 | ⏳ Pending |
| Polish | ⏳ Ожидает | 11 | Step 10 | ⏳ Pending |

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
