# TEST REGISTRY — Реестр тестов MaaS

*Последнее обновление: 2025-11-25*

> **Этот файл** — единый реестр всех тестов проекта.
> Коррелирует с PROJECT_SNAPSHOT.md и CLAUDE.md.

---

## Обзор

| Шаг | Модуль | Тестов | Passed | Failed | Coverage |
|-----|--------|--------|--------|--------|----------|
| 0 | DB Connection | 3 | 3 | 0 | ✅ 100% |
| 1 | Schema + Seeds | 4 | 4 | 0 | ✅ 100% |
| 2 | Test Runner | 5 | 5 | 0 | ✅ 100% |
| 3 | Orchestrator | 4 | 4 | 0 | ✅ 100% |
| 4 | Agent Stubs | 3 | 3 | 0 | ✅ 100% |
| 5 | Logger | 2 | 2 | 0 | ✅ 100% |
| 6 | Analyzer | 4 | 4 | 0 | ✅ 100% |
| 7 | Assembler | 4 | 4 | 0 | ✅ 100% |
| 8 | FinalResponder | 5 | 5 | 0 | ✅ 100% |
| 9 | Archivist | 4 | 4 | 0 | ✅ 100% |
| 10 | Assembler v2 | 0 | 0 | 0 | ⏳ 0% |
| 11 | Polish | 0 | 0 | 0 | ⏳ 0% |

**Всего тестов:** 38 | **Passed:** 38 | **Failed:** 0

---

## Step 0: DB Connection

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T0.1 | Подключение к Supabase | ✅ | [db-connection.md](scenarios/db-connection.md) |
| T0.2 | SSL соединение работает | ✅ | [db-connection.md](scenarios/db-connection.md) |
| T0.3 | Pool создаётся корректно | ✅ | [db-connection.md](scenarios/db-connection.md) |

**Команда:** `npm run db:test`

---

## Step 1: Schema + Seeds

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T1.1 | Таблица pipeline_runs существует | ✅ | [schema-seeds.md](scenarios/schema-seeds.md) |
| T1.2 | Таблица lsm_storage существует | ✅ | [schema-seeds.md](scenarios/schema-seeds.md) |
| T1.3 | Триггер NOTIFY работает | ✅ | [schema-seeds.md](scenarios/schema-seeds.md) |
| T1.4 | Seeds применены (test_dialogs) | ✅ | [schema-seeds.md](scenarios/schema-seeds.md) |

**Команда:** `npm run db:schema && npm run db:seeds`

---

## Step 2: Test Runner

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T2.1 | Engine запускается в mock mode | ✅ | [test-runner.md](scenarios/test-runner.md) |
| T2.2 | API endpoints работают | ✅ | [test-runner.md](scenarios/test-runner.md) |
| T2.3 | Web UI загружается | ✅ | [test-runner.md](scenarios/test-runner.md) |
| T2.4 | Тест создаёт pipeline_run | ✅ | [test-runner.md](scenarios/test-runner.md) |
| T2.5 | Mock mode возвращает результат | ✅ | [test-runner.md](scenarios/test-runner.md) |

**Команда:** `npm run dev` → `http://localhost:3000/test-runner/`

---

## Step 3: Orchestrator

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T3.1 | LISTEN pipeline_events работает | ✅ | [orchestrator.md](scenarios/orchestrator.md) |
| T3.2 | Получение NOTIFY событий | ✅ | [orchestrator.md](scenarios/orchestrator.md) |
| T3.3 | Маршрутизация к агентам | ✅ | [orchestrator.md](scenarios/orchestrator.md) |
| T3.4 | Reconnect при обрыве | ✅ | [orchestrator.md](scenarios/orchestrator.md) |

**Команда:** `npm run orchestrator`

---

## Step 4: Agent Stubs

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T4.1 | Идемпотентный захват задачи | ✅ | [agents.md](scenarios/agents.md) |
| T4.2 | Переход статусов корректен | ✅ | [agents.md](scenarios/agents.md) |
| T4.3 | Ошибка → FAILED статус | ✅ | [agents.md](scenarios/agents.md) |

**Проверка:** Через Orchestrator + INSERT в pipeline_runs

---

## Step 5: Logger

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T5.1 | Все уровни логирования | ✅ | [logger.md](scenarios/logger.md) |
| T5.2 | JSON форматирование объектов | ✅ | [logger.md](scenarios/logger.md) |

**Проверка:** Визуально в консоли при запуске

---

## Step 6: Analyzer

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T6.1 | Извлечение keywords из query | ✅ | [analyzer.md](scenarios/analyzer.md) |
| T6.2 | Поиск в LSM по semantic_tags | ✅ | [analyzer.md](scenarios/analyzer.md) |
| T6.3 | Возврат до 3 memories | ✅ | [analyzer.md](scenarios/analyzer.md) |
| T6.4 | Сохранение в analysis_result | ✅ | [analyzer.md](scenarios/analyzer.md) |

**Команда:** Через полный pipeline (Orchestrator + запрос)

---

## Step 7: Assembler

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T7.1 | Чтение analysis_result | ✅ | [assembler.md](scenarios/assembler.md) |
| T7.2 | Получение raw_logs | ✅ | [assembler.md](scenarios/assembler.md) |
| T7.3 | Формат контекста корректен | ✅ | [assembler.md](scenarios/assembler.md) |
| T7.4 | Сохранение в final_context_payload | ✅ | [assembler.md](scenarios/assembler.md) |

**Команда:** Через полный pipeline

---

## Step 8: FinalResponder

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T8.1 | OpenAI API подключение | ✅ | [final-responder.md](scenarios/final-responder.md) |
| T8.2 | Вызов gpt-4o-mini | ✅ | [final-responder.md](scenarios/final-responder.md) |
| T8.3 | Сохранение final_answer | ✅ | [final-responder.md](scenarios/final-responder.md) |
| T8.4 | Логирование в raw_logs | ✅ | [final-responder.md](scenarios/final-responder.md) |
| T8.5 | Статус → COMPLETED | ✅ | [final-responder.md](scenarios/final-responder.md) |

**Команда:** Полный E2E тест через Orchestrator

---

## Step 9: Archivist ✅

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T9.1 | Чтение raw_logs для архивации | ✅ | [archivist.md](scenarios/archivist.md) |
| T9.2 | Суммаризация через LLM | ✅ | [archivist.md](scenarios/archivist.md) |
| T9.3 | Извлечение semantic_tags | ✅ | [archivist.md](scenarios/archivist.md) |
| T9.4 | Запись в lsm_storage | ✅ | [archivist.md](scenarios/archivist.md) |

**Команда:** Автоматически после COMPLETED в Orchestrator

---

## Step 10: Assembler v2 (⏳ Pending)

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T10.1 | Приоритизация контекста | ⏳ | TBD |
| T10.2 | Лимит токенов | ⏳ | TBD |

---

## Step 11: Polish (⏳ Pending)

| ID | Тест | Статус | Сценарий |
|----|------|--------|----------|
| T11.1 | E2E полный цикл | ⏳ | TBD |
| T11.2 | Error handling | ⏳ | TBD |
| T11.3 | Performance | ⏳ | TBD |

---

## Интеграционные тесты (E2E)

| ID | Тест | Статус | Описание |
|----|------|--------|----------|
| E2E.1 | Полный pipeline без памяти | ✅ | NEW → COMPLETED (новый пользователь) |
| E2E.2 | Pipeline с памятью из LSM | ✅ | Запрос с релевантными memories |
| E2E.3 | Pipeline с recent conversation | ✅ | Несколько запросов подряд |
| E2E.4 | Полный цикл с Archivist | ⏳ | Включая запись в LSM |

---

## Как добавить новый тест

1. Добавить запись в соответствующую секцию Step
2. Создать/обновить сценарий в `scenarios/`
3. После выполнения — записать в `TEST_LOG.md`
4. Обновить счётчики в таблице "Обзор"

---

## Связанные файлы

- [PROJECT_SNAPSHOT.md](../PROJECT_SNAPSHOT.md) — статус проекта
- [CLAUDE.md](../CLAUDE.md) — контекст для AI
- [TEST_LOG.md](TEST_LOG.md) — история выполнения тестов

---

*Обновляй этот файл при добавлении новых тестов!*
