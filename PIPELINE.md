# Процессы и взаимодействия в системе MaaS

## Содержание
1. [Обзор Pipeline](#обзор-pipeline)
2. [State Machine](#state-machine)
3. [Основной цикл обработки запроса](#основной-цикл-обработки-запроса)
4. [Синхронный цикл Archivist](#синхронный-цикл-archivist)
5. [Триггеры и события](#триггеры-и-события)
6. [Обработка ошибок](#обработка-ошибок)
7. [Идемпотентность и конкурентность](#идемпотентность-и-конкурентность)

---

## Обзор Pipeline

Система MaaS работает как **синхронный блокирующий цикл**:

### **Единый цикл запроса** (4 LLM-вызова)
```
User Query → [Archivist Signal 1] → Analyzer → Assembler(LLM) → FinalResponder → [Archivist Signal 2] → БЛОК
                    ↓                                                                    ↓
              запись в LSM                                                         суммаризация → LSM
                                                                                        ↓
                                                                            СЛЕДУЮЩИЙ ЗАПРОС ЖДЁТ
```

### **Время цикла**: 5-15 секунд
- Analyzer: 1-3 сек (LLM)
- Assembler: 1-2 сек (LLM)
- FinalResponder: 2-8 сек (LLM)
- Archivist Signal 2: 1-3 сек (LLM суммаризация)

### **Принцип блокировки**
Следующий запрос **НЕ начинается** пока Archivist не завершит суммаризацию.
Это гарантирует консистентность LSM — человек не отвечает мгновенно, и модель тоже может подождать.

---

## State Machine

### Диаграмма состояний

```
                    ┌─────────────┐
                    │   START     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     NEW     │◄────── (Request Handler создает)
                    └──────┬──────┘
                           │ trigger: Orchestrator
                           │ action: runAnalyzer()
                    ┌──────▼──────┐
                    │  ANALYZING  │◄────── (идемпотентный захват)
                    └──────┬──────┘
                           │ success
                    ┌──────▼──────┐
                    │  ANALYZED   │
                    └──────┬──────┘
                           │ trigger: Orchestrator
                           │ action: runAssembler()
                    ┌──────▼──────┐
                    │ ASSEMBLING  │◄────── (идемпотентный захват)
                    └──────┬──────┘
                           │ success
                    ┌──────▼──────┐
                    │    READY    │
                    └──────┬──────┘
                           │ trigger: Orchestrator
                           │ action: runFinalResponder()
                    ┌──────▼──────┐
                    │ RESPONDING  │◄────── (идемпотентный захват)
                    └──────┬──────┘
                           │ success
                    ┌──────▼──────┐
                    │  COMPLETED  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     END     │
                    └─────────────┘

                           ↓ (любой момент при ошибке)
                    ┌──────────────┐
                    │    FAILED    │
                    └──────────────┘
```

### Таблица переходов состояний

| Текущий статус | Событие | Действие | Новый статус | Модуль |
|----------------|---------|----------|--------------|--------|
| - | HTTP POST | Создать запрос | NEW | Request Handler |
| NEW | NOTIFY | Анализ запроса | ANALYZING | Analyzer |
| ANALYZING | Success | Сохранить результат | ANALYZED | Analyzer |
| ANALYZED | NOTIFY | Сборка контекста | ASSEMBLING | Assembler |
| ASSEMBLING | Success | Сохранить контекст | READY | Assembler |
| READY | NOTIFY | Вызов LLM | RESPONDING | Final Responder |
| RESPONDING | Success | Сохранить ответ | COMPLETED | Final Responder |
| * | Error | Логировать ошибку | FAILED | Any |

---

## Основной цикл обработки запроса

### Шаг 0: Прием запроса

**Участники**: User → Request Handler

```
┌──────┐
│ User │
└───┬──┘
    │ HTTP POST /api/query
    │ { "user_id": "uuid", "query": "текст" }
    ↓
┌────────────────┐
│ Request Handler│
└───┬────────┬───┘
    │        │
    │        │ (async fire-and-forget)
    │        ↓
    │    ┌────────┐
    │    │ Logger │────► INSERT INTO raw_logs
    │    └────────┘      (message_type='user_query')
    │
    ↓
INSERT INTO pipeline_runs (
    user_id,
    user_query,
    status='NEW'
)
    │
    ↓
PostgreSQL TRIGGER:
notify_pipeline_change()
    │
    ↓
pg_notify('pipeline_events', {
    id: uuid,
    status: 'NEW',
    operation: 'INSERT'
})
    │
    ↓
HTTP Response: {
    "request_id": "uuid",
    "status": "processing"
}
```

**Время**: ~50-100ms

---

### Шаг 1: Анализ запроса

**Участники**: Orchestrator → Analyzer

```
┌──────────────┐
│ Orchestrator │◄── LISTEN 'pipeline_events'
└──────┬───────┘
       │ Получено: { id, status='NEW' }
       │
       │ switch(status):
       │   case 'NEW': runAnalyzer(id)
       ↓
┌──────────────┐
│   Analyzer   │
└──────┬───────┘
       │
       │ 1. Идемпотентный захват задачи
       ↓
UPDATE pipeline_runs
SET status = 'ANALYZING'
WHERE id = ${id}
  AND status = 'NEW'
RETURNING *
       │
       │ Если вернуло 0 строк → задача уже взята другим воркером → EXIT
       │ Если вернуло 1 строку → продолжаем
       ↓
       │ 2. Читаем промпт
       ↓
SELECT prompt_template
FROM system_prompts
WHERE role_name = 'Analyzer'
  AND is_active = true
       │
       ↓
       │ 3. Читаем LSM для поиска
       ↓
SELECT id, time_bucket_start, time_bucket_end, tags, summary
FROM lsm_storage
ORDER BY time_bucket_start DESC
LIMIT 20
       │
       ↓
       │ 4. Вызываем LLM (дешевую модель, например Gemini Flash)
       ↓
LLM API Call:
  prompt: ${analyzer_prompt}
  input: {
      user_query: ${query},
      lsm_summary: ${lsm_records}
  }
       │
       ↓
       │ 5. Парсим JSON ответ
       ↓
analysis_result = {
    needs_context: boolean,
    context_type: string,
    time_scope: string,
    search_keywords: [...],
    context_found: {...}
}
       │
       ↓
       │ 6. Сохраняем результат
       ↓
UPDATE pipeline_runs
SET
    analysis_result = ${json},
    status = 'ANALYZED',
    updated_at = NOW()
WHERE id = ${id}
       │
       ↓
PostgreSQL TRIGGER:
pg_notify('pipeline_events', {
    id: uuid,
    status: 'ANALYZED'
})
```

**Время**: ~1-3 секунды

---

### Шаг 2: Сборка контекста (двухэтапная)

**Участники**: Orchestrator → Draft Builder (код) → Assembler (LLM)

```
┌──────────────┐
│ Orchestrator │◄── NOTIFY { id, status='ANALYZED' }
└──────┬───────┘
       │ switch(status):
       │   case 'ANALYZED': runContextAssembly(id)
       ↓
╔══════════════════════════════════════════════════════════════════════╗
║                    ЭТАП 2.1: DRAFT BUILDER (КОД)                     ║
╠══════════════════════════════════════════════════════════════════════╣
       │
       │ 1. Идемпотентный захват
       ↓
UPDATE pipeline_runs
SET status = 'ASSEMBLING'
WHERE id = ${id}
  AND status = 'ANALYZED'
RETURNING *
       │
       ↓
       │ 2. Собираем 4 элемента драфта:
       │
       │ ┌─────────────────────────────────────────────────────────┐
       │ │  ЭЛЕМЕНТ 1: Исходный запрос                            │
       │ │  └─ SELECT user_query FROM pipeline_runs WHERE id=$id  │
       │ ├─────────────────────────────────────────────────────────┤
       │ │  ЭЛЕМЕНТ 2: Исторический контекст                      │
       │ │  ├─ 2.1: Последние 10 инференсов из raw_logs           │
       │ │  │       SELECT * FROM raw_logs WHERE user_id=$uid     │
       │ │  │       ORDER BY created_at DESC LIMIT 10             │
       │ │  └─ 2.2: Фокусированный контекст (analysis_result)     │
       │ │          + полные данные из lsm_storage                │
       │ ├─────────────────────────────────────────────────────────┤
       │ │  ЭЛЕМЕНТ 3: Промпт роли                                │
       │ │  └─ SELECT prompt_template FROM system_prompts         │
       │ │     WHERE role_name = 'Mentor'                         │
       │ ├─────────────────────────────────────────────────────────┤
       │ │  ЭЛЕМЕНТ 4: Промпт Ассемблера                          │
       │ │  └─ SELECT prompt_template FROM system_prompts         │
       │ │     WHERE role_name = 'Assembler'                      │
       │ └─────────────────────────────────────────────────────────┘
       │
       ↓
       │ 3. Механическая конкатенация → ДРАФТ
       ↓
draft_context = concatenate(element1, element2, element3, element4)
       │
       ↓
UPDATE pipeline_runs
SET draft_context = ${draft_context}
WHERE id = ${id}
       │
╚══════════════════════════════════════════════════════════════════════╝
       │
       ↓
╔══════════════════════════════════════════════════════════════════════╗
║                    ЭТАП 2.2: ASSEMBLER (LLM)                         ║
╠══════════════════════════════════════════════════════════════════════╣
       │
       │ 4. Вызов LLM для оптимизации драфта
       ↓
LLM API Call:
  prompt: ${assembler_prompt} (element 4)
  input: ${draft_context}
  task: "Оптимизируй драфт → финальный контекст"
       │
       │ LLM делает:
       │ - Убирает нерелевантное
       │ - Фокусирует на текущем запросе
       │ - Структурирует с XML-тегами
       │ - Соблюдает token limit (8000)
       ↓
final_context_payload = llm_response
       │
       ↓
       │ 5. Сохраняем финальный контекст
       ↓
UPDATE pipeline_runs
SET
    final_context_payload = ${final_context_payload},
    status = 'READY',
    updated_at = NOW()
WHERE id = ${id}
       │
╚══════════════════════════════════════════════════════════════════════╝
       │
       ↓
PostgreSQL TRIGGER:
pg_notify('pipeline_events', {
    id: uuid,
    status: 'READY'
})
```

**Время**:
- Этап 2.1 (Draft Builder): ~100-200ms (только SQL)
- Этап 2.2 (Assembler LLM): ~1-2 секунды
- **Итого**: ~1.5-2.5 секунды

---

### Шаг 3: Генерация ответа

**Участники**: Orchestrator → Final Responder

```
┌──────────────┐
│ Orchestrator │◄── NOTIFY { id, status='READY' }
└──────┬───────┘
       │ switch(status):
       │   case 'READY': runFinalResponder(id)
       ↓
┌──────────────────┐
│ Final Responder  │
└──────┬───────────┘
       │
       │ 1. Идемпотентный захват
       ↓
UPDATE pipeline_runs
SET status = 'RESPONDING'
WHERE id = ${id}
  AND status = 'READY'
RETURNING *
       │
       ↓
       │ 2. Читаем подготовленный контекст
       ↓
SELECT
    final_context_payload,
    user_id
FROM pipeline_runs
WHERE id = ${id}
       │
       ↓
       │ 3. Вызываем финальную LLM (мощную модель)
       ↓
LLM API Call:
  model: 'claude-sonnet-4' | 'gemini-1.5-pro' | 'gpt-4o'
  prompt: ${final_context_payload}
  temperature: 0.7
  max_tokens: 2000
  timeout: 30s
       │
       ↓
       │ Обработка ошибок:
       │ - Retry 3 раза с exponential backoff
       │ - При timeout/rate-limit: retry
       │ - При fatal error: статус FAILED
       ↓
       │ 4. Получен ответ
       ↓
final_answer = llm_response.text
       │
       ↓
       │ 5. Сохраняем ответ
       ↓
UPDATE pipeline_runs
SET
    final_answer = ${final_answer},
    status = 'COMPLETED',
    updated_at = NOW()
WHERE id = ${id}
       │
       ↓
       │ 6. Логируем ответ (async)
       ↓
    ┌────────┐
    │ Logger │────► INSERT INTO raw_logs
    └────────┘      (message_type='assistant_response',
                     content=${final_answer})
       │
       ↓
PostgreSQL TRIGGER:
pg_notify('pipeline_events', {
    id: uuid,
    status: 'COMPLETED'
})
       │
       ↓
(Опционально) Триггер Archivist
```

**Время**: ~2-10 секунд (в зависимости от LLM)

---

### Шаг 4: Возврат ответа пользователю

**Вариант А: Polling** (клиент опрашивает статус)

```
User → GET /api/query/{request_id}/status

Если status = 'COMPLETED':
    SELECT final_answer
    FROM pipeline_runs
    WHERE id = ${request_id}

    Response: {
        "status": "completed",
        "answer": "текст ответа"
    }

Если status = 'FAILED':
    Response: {
        "status": "failed",
        "error": "описание ошибки"
    }

Если status IN ('NEW', 'ANALYZING', 'ASSEMBLING', 'READY', 'RESPONDING'):
    Response: {
        "status": "processing"
    }
```

**Вариант Б: WebSocket** (push уведомление)

```
User подключен к WS: /api/ws

При status = 'COMPLETED':
    WebSocket.send({
        "request_id": uuid,
        "status": "completed",
        "answer": "текст ответа"
    })
```

---

## Синхронный цикл Archivist

### Archivist работает в 2 сигналах (не фоновый!)

> **ВАЖНО:** Archivist — синхронный модуль, интегрированный в основной цикл запроса.
> Следующий запрос **блокируется** до завершения суммаризации.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ЦИКЛ ОБРАБОТКИ ЗАПРОСА                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                                                 │
│  │ SIGNAL 1        │ ◄── При получении запроса                       │
│  │ (начало цикла)  │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           │ Быстрая запись запроса в LSM                             │
│           │ (без LLM вызова, просто INSERT)                         │
│           ↓                                                          │
│  ┌─────────────────┐                                                 │
│  │ Analyzer (LLM)  │                                                 │
│  └────────┬────────┘                                                 │
│           ↓                                                          │
│  ┌─────────────────┐                                                 │
│  │ Assembler (LLM) │                                                 │
│  └────────┬────────┘                                                 │
│           ↓                                                          │
│  ┌─────────────────┐                                                 │
│  │ FinalResponder  │                                                 │
│  │ (LLM)           │                                                 │
│  └────────┬────────┘                                                 │
│           ↓                                                          │
│  ┌─────────────────┐                                                 │
│  │ SIGNAL 2        │ ◄── После получения ответа                      │
│  │ (конец цикла)   │                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           │ LLM суммаризация диалога → INSERT в lsm_storage          │
│           │ Время: 1-3 секунды                                       │
│           ↓                                                          │
│  ┌─────────────────┐                                                 │
│  │ БЛОКИРОВКА      │                                                 │
│  │ СНЯТА           │                                                 │
│  └─────────────────┘                                                 │
│           ↓                                                          │
│  Следующий запрос может начаться                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Signal 1: Запись запроса (быстро)

```javascript
// При получении нового запроса
async function archivistSignal1(userId, query, pipelineRunId) {
    // Быстрая запись в raw_logs (не LSM!)
    await pool.query(`
        INSERT INTO raw_logs (user_id, log_type, log_data)
        VALUES ($1, 'USER_QUERY', $2)
    `, [userId, JSON.stringify({ query, pipeline_run_id: pipelineRunId })]);

    // Время: ~10-50ms (без LLM)
}
```

### Signal 2: Суммаризация после ответа (LLM)

```javascript
// После получения final_answer
async function archivistSignal2(userId, query, answer, pipelineRunId) {
    // 1. Читаем промпт Архивариуса
    const promptResult = await pool.query(`
        SELECT prompt_template FROM system_prompts
        WHERE role_name = 'Archivist'
    `);

    // 2. Вызываем LLM для суммаризации
    const summary = await callLLM({
        prompt: promptResult.rows[0].prompt_template,
        input: {
            query,
            answer,
            timestamp: new Date().toISOString()
        }
    });

    // 3. Записываем в LSM
    await pool.query(`
        INSERT INTO lsm_storage (time_bucket_start, time_bucket_end, tags, summary, raw_log_ids)
        VALUES ($1, $2, $3, $4, $5)
    `, [today, today, summary.tags, summary.text, [pipelineRunId]]);

    // Время: 1-3 секунды (LLM вызов)
}
```

### Почему синхронный?

| Async подход | Sync подход (выбран) |
|--------------|----------------------|
| Следующий запрос начинается сразу | Следующий запрос ждёт |
| LSM может быть неконсистентным | LSM всегда актуален |
| Сложная логика конфликтов | Простая логика |
| Race conditions | Нет race conditions |
| Быстрее отклик | Задержка 1-3 сек |

**Вывод:** Консистентность LSM важнее скорости. Человек всё равно думает несколько секунд перед следующим вопросом.

---

## Триггеры и события

### PostgreSQL Trigger: notify_pipeline_change

**Когда срабатывает**: После INSERT или UPDATE поля `status` в таблице `pipeline_runs`

**Что делает**:
```sql
PERFORM pg_notify(
    'pipeline_events',
    json_build_object(
        'id', NEW.id,
        'status', NEW.status,
        'operation', TG_OP
    )::text
);
```

**Результат**: Событие отправляется всем подписчикам на канал `pipeline_events`

---

### Orchestrator: LISTEN логика

**Подключение**:
```javascript
const client = new Client(dbConfig);
await client.connect();
await client.query("LISTEN pipeline_events");

client.on('notification', async (msg) => {
    const event = JSON.parse(msg.payload);
    await handlePipelineEvent(event);
});
```

**Обработка события**:
```javascript
async function handlePipelineEvent(event) {
    const { id, status } = event;

    try {
        switch(status) {
            case 'NEW':
                await runAnalyzer(id);
                break;
            case 'ANALYZED':
                await runAssembler(id);
                break;
            case 'READY':
                await runFinalResponder(id);
                break;
            case 'COMPLETED':
                // Опционально: триггерить Archivist или метрики
                break;
            case 'FAILED':
                await logError(id);
                break;
            default:
                // Игнорируем промежуточные статусы
        }
    } catch (error) {
        await markAsFailed(id, error.message);
    }
}
```

---

## Обработка ошибок

### Типы ошибок и стратегии

| Ошибка | Где возникает | Стратегия | Статус |
|--------|---------------|-----------|--------|
| DB Connection Lost | Любой модуль | Reconnect с exponential backoff | - |
| LLM API Timeout | Analyzer, Final Responder | Retry 3x с backoff | → FAILED после 3х попыток |
| LLM API Rate Limit | Analyzer, Final Responder | Retry с delay (60s) | → FAILED после 3х попыток |
| Invalid JSON Response | Analyzer, Archivist | Log + Retry 1x | → FAILED |
| LSM Not Found | Analyzer | Continue without context | → ANALYZED (без контекста) |
| Token Limit Exceeded | Assembler | Truncate summary | → READY (с усеченным контекстом) |
| Unknown Error | Любой модуль | Log full stack + Email alert | → FAILED |

### Реализация обработки ошибок

```javascript
async function runAnalyzer(id) {
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries < MAX_RETRIES) {
        try {
            // Идемпотентный захват
            const task = await captureTask(id, 'NEW', 'ANALYZING');
            if (!task) return; // Уже взята другим воркером

            // Основная логика
            const result = await analyzeQuery(task);

            // Сохранение результата
            await saveAnalysisResult(id, result);

            return; // Success

        } catch (error) {
            retries++;

            if (error.type === 'RATE_LIMIT' && retries < MAX_RETRIES) {
                await sleep(60000); // 60 секунд
                continue;
            }

            if (error.type === 'TIMEOUT' && retries < MAX_RETRIES) {
                await sleep(Math.pow(2, retries) * 1000); // Exponential backoff
                continue;
            }

            // Fatal error
            await markAsFailed(id, error.message);
            throw error;
        }
    }

    // Все ретраи исчерпаны
    await markAsFailed(id, 'Max retries exceeded');
}
```

---

## Идемпотентность и конкурентность

### Проблема: Race Condition

Если запущено несколько воркеров Orchestrator, они могут попытаться обработать одну задачу одновременно.

```
Воркер A: Видит status='NEW' для id=123
Воркер B: Видит status='NEW' для id=123

Воркер A: Начинает обрабатывать
Воркер B: Начинает обрабатывать

❌ Результат: Дублирование работы, потеря ресурсов
```

### Решение: Идемпотентный захват (Atomic Capture)

```javascript
async function captureTask(id, currentStatus, newStatus) {
    const result = await db.query(`
        UPDATE pipeline_runs
        SET
            status = $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = $3
        RETURNING *
    `, [newStatus, id, currentStatus]);

    if (result.rowCount === 0) {
        // Задача уже взята другим воркером или статус изменился
        return null;
    }

    // Мы успешно захватили задачу
    return result.rows[0];
}
```

**Механизм**:
1. UPDATE с условием `WHERE status = 'NEW'`
2. Только один воркер изменит статус благодаря транзакции
3. Остальные получат `rowCount = 0` и выйдут

### Пример использования

```javascript
async function runAnalyzer(id) {
    // Атомарный захват задачи
    const task = await captureTask(id, 'NEW', 'ANALYZING');

    if (!task) {
        // Задача уже взята другим воркером
        console.log(`Task ${id} already processing`);
        return;
    }

    // Мы единственный воркер, обрабатывающий эту задачу
    try {
        const result = await analyzeQuery(task.user_query);
        await saveResult(id, result, 'ANALYZED');
    } catch (error) {
        await markAsFailed(id, error);
    }
}
```

---

## Диаграмма полного цикла с временными метками

```
T+0ms:     User HTTP POST
           │
T+50ms:    ├─► INSERT pipeline_runs (NEW)
           │   └─► NOTIFY event
           │
T+60ms:    ├─► Logger (async) → raw_logs
           │
T+70ms:    ├─► HTTP Response (request_id)
           │
T+100ms:   Orchestrator получает NOTIFY
           │
T+110ms:   runAnalyzer(id)
           ├─► Захват: NEW → ANALYZING
           ├─► Читаем LSM
           ├─► Вызов LLM (Gemini Flash)
           │   ... ожидание 1-2 секунды ...
T+2100ms:  ├─► Ответ LLM получен
           ├─► Сохранить: ANALYZING → ANALYZED
           └─► NOTIFY event
           │
T+2110ms:  Orchestrator получает NOTIFY
           │
T+2120ms:  runAssembler(id)
           ├─► Захват: ANALYZED → ASSEMBLING
           ├─► Читаем полные данные LSM
           ├─► Собираем контекст
T+2500ms:  ├─► Сохранить: ASSEMBLING → READY
           └─► NOTIFY event
           │
T+2510ms:  Orchestrator получает NOTIFY
           │
T+2520ms:  runFinalResponder(id)
           ├─► Захват: READY → RESPONDING
           ├─► Вызов LLM (Claude Sonnet)
           │   ... ожидание 3-8 секунд ...
T+8520ms:  ├─► Ответ LLM получен
           ├─► Сохранить: RESPONDING → COMPLETED
           ├─► Logger (async) → raw_logs
           └─► NOTIFY event
           │
T+8530ms:  User polling: GET /status
           └─► Response: { status: 'completed', answer: '...' }
```

**Итого**: ~8-10 секунд от запроса до ответа

---

## Мониторинг и метрики

### Ключевые метрики для отслеживания

1. **Pipeline Metrics**:
   - Среднее время обработки (T от NEW до COMPLETED)
   - Количество запросов в статусе NEW (backlog)
   - Количество FAILED запросов (error rate)
   - Пропускная способность (requests per minute)

2. **Module Metrics**:
   - Analyzer: время обработки, % с найденным контекстом
   - Assembler: время обработки, средний размер контекста
   - Final Responder: время ответа LLM, retry rate

3. **Database Metrics**:
   - Размер pipeline_runs (для cleanup)
   - Размер raw_logs (для архивирования)
   - Количество записей в lsm_storage

4. **LLM API Metrics**:
   - Количество вызовов
   - Токены использованные (cost estimation)
   - Rate limit hits
   - Timeout errors

---

**Версия документа**: 1.0
**Дата**: 2025-11-25
**Статус**: Финальная версия для реализации
