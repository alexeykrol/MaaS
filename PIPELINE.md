# Процессы и взаимодействия в системе MaaS

## Содержание
1. [Обзор Pipeline](#обзор-pipeline)
2. [State Machine](#state-machine)
3. [Основной цикл обработки запроса](#основной-цикл-обработки-запроса)
4. [Фоновый цикл архивирования](#фоновый-цикл-архивирования)
5. [Триггеры и события](#триггеры-и-события)
6. [Обработка ошибок](#обработка-ошибок)
7. [Идемпотентность и конкурентность](#идемпотентность-и-конкурентность)

---

## Обзор Pipeline

Система MaaS состоит из двух независимых потоков:

### **Быстрый путь (Fast Path)** - Ответ пользователю
```
User Query → Response
Время: 3-10 секунд
Приоритет: Высокий
```

### **Медленный путь (Slow Path)** - Обработка памяти
```
Raw Logs → LSM Storage
Время: Фоновая задача
Приоритет: Низкий
```

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

### Шаг 2: Сборка контекста

**Участники**: Orchestrator → Assembler

```
┌──────────────┐
│ Orchestrator │◄── NOTIFY { id, status='ANALYZED' }
└──────┬───────┘
       │ switch(status):
       │   case 'ANALYZED': runAssembler(id)
       ↓
┌──────────────┐
│  Assembler   │
└──────┬───────┘
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
       │ 2. Читаем данные запроса
       ↓
SELECT
    user_query,
    analysis_result
FROM pipeline_runs
WHERE id = ${id}
       │
       ↓
       │ 3. Если найден контекст → читаем полные данные из LSM
       ↓
IF analysis_result.context_found.lsm_record_id:
    SELECT summary
    FROM lsm_storage
    WHERE id = ${lsm_record_id}
       │
       ↓
       │ 4. Читаем промпты
       ↓
SELECT prompt_template
FROM system_prompts
WHERE role_name IN ('Assembler', 'FinalResponder')
       │
       ↓
       │ 5. Собираем "пирог контекста"
       ↓
final_context = `
<system>
${finalResponderPrompt}
</system>

${if context_found:}
<context_from_history>
Период: ${period}
${lsm_summary}
</context_from_history>
${endif}

<current_query>
${user_query}
</current_query>
`
       │
       ↓
       │ 6. Проверяем token budget (опционально)
       ↓
IF tokenCount(final_context) > MAX_TOKENS:
    Сократить summary
       │
       ↓
       │ 7. Сохраняем результат
       ↓
UPDATE pipeline_runs
SET
    final_context_payload = ${final_context},
    status = 'READY',
    updated_at = NOW()
WHERE id = ${id}
       │
       ↓
PostgreSQL TRIGGER:
pg_notify('pipeline_events', {
    id: uuid,
    status: 'READY'
})
```

**Время**: ~200-500ms

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

## Фоновый цикл архивирования

### Независимый процесс: Archivist

```
┌─────────────┐
│ Cron / Timer│
└──────┬──────┘
       │ Запуск по расписанию (например, каждые 6 часов)
       │ ИЛИ ручной запуск: npm run archivist
       ↓
┌──────────────┐
│  Archivist   │
└──────┬───────┘
       │
       │ 1. Определяем период для обработки
       ↓
period_start = NOW() - INTERVAL '1 day'
period_end = NOW()
       │
       ↓
       │ 2. Читаем необработанные логи
       ↓
SELECT id, user_id, message_type, content, created_at
FROM raw_logs
WHERE created_at BETWEEN ${period_start} AND ${period_end}
  AND id NOT IN (
      SELECT unnest(raw_log_ids)
      FROM lsm_storage
  )
ORDER BY created_at
       │
       ↓
       │ Если нет новых логов → EXIT
       │ Если есть → продолжаем
       ↓
       │ 3. Группируем диалоги
       ↓
dialogues = groupByUserAndThread(raw_logs)
       │
       ↓
       │ 4. Читаем промпт Архивариуса
       ↓
SELECT prompt_template
FROM system_prompts
WHERE role_name = 'Archivist'
       │
       ↓
       │ 5. Для каждой группы вызываем LLM
       ↓
FOR EACH dialogue IN dialogues:

    LLM API Call:
      prompt: ${archivist_prompt}
      input: {
          start_date: ${period_start},
          end_date: ${period_end},
          raw_logs: ${dialogue.messages}
      }

    lsm_record = parse_json(llm_response)

    │
    ↓
    │ 6. Сохраняем в LSM
    ↓
    INSERT INTO lsm_storage (
        time_bucket_start,
        time_bucket_end,
        tags,
        summary,
        raw_log_ids
    ) VALUES (
        ${lsm_record.time_bucket_start},
        ${lsm_record.time_bucket_end},
        ${lsm_record.tags},
        ${lsm_record.summary},
        ${dialogue.log_ids}
    )
       │
       ↓
END LOOP
       │
       ↓
LOG: "Processed ${count} dialogues, created ${count} LSM records"
```

**Время**: Зависит от объема (может работать часами для большого архива)

**Частота запуска**:
- MVP: вручную или 1 раз в сутки
- Production: каждые 6-12 часов

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
