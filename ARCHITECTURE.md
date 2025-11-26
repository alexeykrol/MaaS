# Архитектура системы MaaS (Memory as a Service)

## Содержание
1. [Обзор архитектуры](#обзор-архитектуры)
2. [Модули системы](#модули-системы)
3. [Схема базы данных](#схема-базы-данных)
4. [Форматы данных](#форматы-данных)

---

## Обзор архитектуры

### Архитектурный паттерн
**Event-Driven Architecture** на основе **Blackboard Pattern**

### Ключевые принципы
1. **Модульность**: Каждый модуль независим и может разрабатываться/тестироваться отдельно
2. **Event-Driven**: Модули связаны через триггеры изменения состояния в БД (PostgreSQL LISTEN/NOTIFY)
3. **Асинхронность**: Разделение на быстрый путь (ответ пользователю) и медленный путь (фоновая обработка)
4. **Идемпотентность**: Защита от повторной обработки одной задачи несколькими воркерами
5. **State Machine**: Жизненный цикл запроса управляется через статусы в БД

### Высокоуровневая схема
```
User Query → [Request Handler] → pipeline_runs (NEW)
                                       ↓
                                  [Orchestrator] (триггер)
                                       ↓
                   ┌──────────────────┼──────────────────┐
                   ↓                  ↓                  ↓
              [Analyzer]         [Assembler]      [Final Responder]
                   ↓                  ↓                  ↓
              (ANALYZED)        (READY)            (COMPLETED)
                   ↓                                    ↓
              lsm_storage ←──────────────────────[Archivist]
                                                        ↑
                                                   raw_logs
```

---

## Модули системы

### Модуль 1: Request Handler (Приемщик запросов)

#### Назначение
Точка входа в систему. Принимает HTTP-запросы от пользователей и инициирует pipeline обработки.

#### Требования
- REQ-RH-1: Принимать HTTP POST запросы с user_query
- REQ-RH-2: Создавать запись в pipeline_runs со статусом NEW
- REQ-RH-3: Триггерить асинхронную запись в raw_logs
- REQ-RH-4: Возвращать немедленный ответ с request_id
- REQ-RH-5: Время обработки < 100ms

#### Вход
**Источник**: HTTP POST запрос от пользователя

**Формат**:
```json
{
  "user_id": "UUID",
  "query": "текст запроса пользователя"
}
```

#### Выход
**Получатель 1**: Таблица `pipeline_runs`

**Формат**:
```sql
INSERT INTO pipeline_runs (id, user_id, user_query, status)
VALUES (uuid, user_id, query, 'NEW')
```

**Получатель 2**: Модуль Logger (асинхронно)

**HTTP Response**:
```json
{
  "request_id": "UUID",
  "status": "processing"
}
```

---

### Модуль 2: Logger (Логгер)

#### Назначение
Асинхронная запись всех инференсов (запросов и ответов) в сырой лог для полного аудита и последующей обработки Архивариусом.

#### Требования
- REQ-LOG-1: Записывать все запросы пользователей в raw_logs
- REQ-LOG-2: Записывать все ответы модели в raw_logs
- REQ-LOG-3: Не блокировать основной поток (fire-and-forget)
- REQ-LOG-4: Гарантировать запись даже при сбоях pipeline
- REQ-LOG-5: Включать метаданные (timestamp, user_id, message_type)

#### Вход
**Источник 1**: Request Handler (запрос пользователя)
**Источник 2**: Final Responder (ответ модели)

**Формат**:
```json
{
  "user_id": "UUID",
  "message_type": "user_query | assistant_response",
  "content": "текст сообщения",
  "metadata": {
    "request_id": "UUID",
    "timestamp": "ISO8601"
  }
}
```

#### Выход
**Получатель**: Таблица `raw_logs`

**Формат**:
```sql
INSERT INTO raw_logs (id, user_id, message_type, content, metadata, created_at)
VALUES (uuid, user_id, type, content, metadata_json, now())
```

---

### Модуль 3: Orchestrator (Оркестратор)

#### Назначение
Координатор модулей. Слушает изменения в таблице pipeline_runs через PostgreSQL LISTEN/NOTIFY и вызывает соответствующие агенты в зависимости от статуса.

#### Требования
- REQ-ORC-1: Подключаться к PostgreSQL через LISTEN на канале 'pipeline_events'
- REQ-ORC-2: Реагировать на изменения статуса в pipeline_runs < 10ms
- REQ-ORC-3: Маршрутизировать задачи к правильным агентам
- REQ-ORC-4: Обрабатывать ошибки и устанавливать статус FAILED
- REQ-ORC-5: Поддерживать reconnect при обрыве соединения с БД
- REQ-ORC-6: Логировать все события и ошибки

#### Вход
**Источник**: PostgreSQL NOTIFY события

**Формат**:
```json
{
  "id": "UUID запроса из pipeline_runs",
  "status": "NEW | ANALYZED | READY | COMPLETED",
  "operation": "INSERT | UPDATE"
}
```

#### Выход
**Получатель**: Вызов соответствующего агента (Analyzer/Assembler/FinalResponder)

**Логика маршрутизации**:
```
status = 'NEW'      → runAnalyzer(id)
status = 'ANALYZED' → runAssembler(id)
status = 'READY'    → runFinalResponder(id)
status = 'COMPLETED' → (optional) triggerArchivist()
status = 'FAILED'   → logError()
```

---

### Модуль 4: Analyzer (Анализатор запроса)

#### Назначение
Анализирует запрос пользователя и определяет, нужен ли контекст из долгосрочной памяти (LSM). Если нужен - ищет релевантный контекст.

#### Требования
- REQ-ANL-1: Читать промпт из system_prompts WHERE role_name='Analyzer'
- REQ-ANL-2: Классифицировать запрос (GENERAL vs NEED_CONTEXT)
- REQ-ANL-3: При NEED_CONTEXT искать в lsm_storage по времени и семантике
- REQ-ANL-4: Формировать структурированный JSON с результатом анализа
- REQ-ANL-5: Идемпотентно захватывать задачи (UPDATE ... WHERE status='NEW' RETURNING *)
- REQ-ANL-6: Время обработки < 3 секунд
- REQ-ANL-7: При ошибке устанавливать статус FAILED с описанием

#### Вход
**Источник 1**: Таблица `pipeline_runs` WHERE status='NEW'

**Поля**:
- id (UUID)
- user_query (TEXT)
- user_id (UUID)

**Источник 2**: Таблица `lsm_storage` (для поиска контекста)

**Источник 3**: Таблица `system_prompts` WHERE role_name='Analyzer'

#### Выход
**Получатель**: Таблица `pipeline_runs`, поле `analysis_result` (JSONB)

**Формат**:
```json
{
  "needs_context": true,
  "context_type": "GENERAL | SPECIFIC_HISTORY",
  "time_scope": "hot | warm | cold",
  "search_keywords": ["keyword1", "keyword2", "keyword3"],
  "context_found": {
    "period": "2025-Week-47",
    "summary": "Краткая выжимка найденного контекста",
    "relevance_score": 0.85,
    "lsm_record_id": "UUID"
  }
}
```

**Обновление статуса**: NEW → ANALYZED

#### Промпт (System Prompt)
```
Ты - Анализатор запросов для AI-ментора.

ЗАДАЧА:
Проанализируй запрос пользователя и определи:
1. Нужен ли контекст из истории диалогов?
2. Если да - к какому временному периоду относится запрос?
3. Какие ключевые слова использовать для поиска?

ПРАВИЛА:
- Если запрос содержит "мы обсуждали", "помнишь", "как тогда", "продолжи" → needs_context = true
- Если запрос содержит "мой", "наш", "тот проект" → needs_context = true
- Если запрос самодостаточный (факты, общие вопросы) → needs_context = false
- Временной scope:
  * "hot" = последние 3 дня (упоминание "вчера", "недавно")
  * "warm" = последние 1-2 недели (упоминание "на неделе")
  * "cold" = больше 2 недель (упоминание "в прошлом месяце", конкретные даты)

ВХОД:
Запрос: {user_query}

Доступная память (LSM):
{lsm_records_summary}

ВЫХОД:
Верни строго JSON в формате:
{
  "needs_context": boolean,
  "context_type": "GENERAL | SPECIFIC_HISTORY",
  "time_scope": "hot|warm|cold",
  "search_keywords": ["keyword1", "keyword2"],
  "context_found": {
    "period": "период из LSM или null",
    "summary": "краткое описание найденного или null",
    "relevance_score": 0.0-1.0,
    "lsm_record_id": "UUID или null"
  }
}
```

---

### Модуль 5: Assembler (Сборщик контекста)

#### Назначение
Формирует финальный "пирог контекста" для отвечающей модели, собирая вместе: системную инструкцию, найденный контекст из истории, текущий запрос.

#### Требования
- REQ-ASM-1: Читать промпт из system_prompts WHERE role_name='Assembler'
- REQ-ASM-2: Брать результат анализа из pipeline_runs.analysis_result
- REQ-ASM-3: При наличии контекста извлекать полные данные из lsm_storage
- REQ-ASM-4: Формировать структурированный промпт для финальной модели
- REQ-ASM-5: Учитывать бюджет контекста (token limit)
- REQ-ASM-6: Идемпотентно захватывать задачи (UPDATE ... WHERE status='ANALYZED')
- REQ-ASM-7: Время обработки < 1 секунда

#### Вход
**Источник 1**: Таблица `pipeline_runs` WHERE status='ANALYZED'

**Поля**:
- id (UUID)
- user_query (TEXT)
- analysis_result (JSONB)

**Источник 2**: Таблица `lsm_storage` (если найден контекст)

**Источник 3**: Таблица `system_prompts` WHERE role_name='Assembler' и 'FinalResponder'

#### Выход
**Получатель**: Таблица `pipeline_runs`, поле `final_context_payload` (TEXT)

**Формат** (структурированный текст для LLM):
```
<system>
Ты - AI ментор. Твоя задача помогать пользователю достигать целей.

Принципы:
- Анализируй, не давай готовых решений
- Задавай уточняющие вопросы
- Используй контекст из прошлых диалогов
</system>

<context_from_history>
Период: {period}
{summary из LSM}
</context_from_history>

<current_query>
{user_query}
</current_query>
```

**Обновление статуса**: ANALYZED → READY

#### Промпт (System Prompt)
```
Ты - Сборщик контекста для AI-ментора.

ЗАДАЧА:
Собери финальный промпт для отвечающей модели из компонентов:
1. Системная инструкция (base instructions)
2. Контекст из истории (если найден Анализатором)
3. Текущий запрос пользователя

ПРАВИЛА:
- Используй XML-теги для структурирования
- Если контекст найден - добавь секцию <context_from_history>
- Если контекста нет - пропусти эту секцию
- Не превышай token limit: 8000 токенов
- Если контекст слишком длинный - сократи summary

ВХОД:
User query: {user_query}
Analysis result: {analysis_result_json}
LSM data: {lsm_data если есть}

ВЫХОД:
Верни готовый промпт в формате:
<system>...</system>
<context_from_history>...</context_from_history>
<current_query>...</current_query>
```

---

### Модуль 6: Final Responder (Финальная отвечающая модель)

#### Назначение
Вызывает LLM API с подготовленным контекстом и генерирует финальный ответ пользователю.

#### Требования
- REQ-FIN-1: Читать промпт из pipeline_runs.final_context_payload
- REQ-FIN-2: Вызывать LLM API (конфигурируемая модель)
- REQ-FIN-3: Обрабатывать ошибки API (retry, timeout)
- REQ-FIN-4: Сохранять ответ в pipeline_runs.final_answer
- REQ-FIN-5: Триггерить Logger для записи ответа в raw_logs
- REQ-FIN-6: Идемпотентно захватывать задачи (UPDATE ... WHERE status='READY')
- REQ-FIN-7: Максимальное время ожидания ответа: 30 секунд
- REQ-FIN-8: При ошибке повторить 3 раза с exponential backoff

#### Вход
**Источник**: Таблица `pipeline_runs` WHERE status='READY'

**Поля**:
- id (UUID)
- final_context_payload (TEXT)
- user_id (UUID)

#### Выход
**Получатель 1**: Таблица `pipeline_runs`, поле `final_answer` (TEXT)

**Получатель 2**: Модуль Logger (для записи в raw_logs)

**Формат ответа**:
```
Текстовый ответ от LLM модели
```

**Обновление статуса**: READY → COMPLETED

#### Конфигурация LLM
```json
{
  "provider": "gemini | claude | openai",
  "model": "gemini-1.5-pro | claude-sonnet-4 | gpt-4o",
  "temperature": 0.7,
  "max_tokens": 2000,
  "timeout": 30000
}
```

---

### Модуль 7: Archivist (Архивариус)

#### Назначение
Фоновый процесс, который перерабатывает сырые логи диалогов в структурированную долгосрочную семантическую память (LSM).

#### Требования
- REQ-ARC-1: Читать промпт из system_prompts WHERE role_name='Archivist'
- REQ-ARC-2: Обрабатывать raw_logs за заданный период
- REQ-ARC-3: Создавать сжатые записи в lsm_storage с тегами и summary
- REQ-ARC-4: Запускаться независимо от основного pipeline (off-path)
- REQ-ARC-5: Поддерживать запуск по расписанию (cron) или вручную
- REQ-ARC-6: Не обрабатывать одни и те же логи дважды
- REQ-ARC-7: Обрабатывать логи периодами (день, неделя)
- REQ-ARC-8: Игнорировать small-talk, фокусироваться на значимых диалогах

#### Вход
**Источник**: Таблица `raw_logs`

**Фильтр**:
```sql
SELECT * FROM raw_logs
WHERE created_at BETWEEN start_date AND end_date
  AND id NOT IN (SELECT unnest(raw_log_ids) FROM lsm_storage)
ORDER BY created_at
```

**Источник 2**: Таблица `system_prompts` WHERE role_name='Archivist'

#### Выход
**Получатель**: Таблица `lsm_storage`

**Формат**:
```json
{
  "time_bucket_start": "2025-11-20",
  "time_bucket_end": "2025-11-22",
  "tags": ["Python", "MaaS", "Architecture", "Planning"],
  "summary": "Обсуждали архитектуру системы MaaS. Определили структуру БД из 4 таблиц. Согласовали последовательность разработки от простого к сложному. Решили начать с TypeScript + PostgreSQL.",
  "raw_log_ids": ["uuid1", "uuid2", "uuid3"]
}
```

#### Промпт (System Prompt)
```
Ты - Архивариус для AI-ментора.

ЗАДАЧА:
Проанализируй диалоги за период и создай сжатую семантическую запись для долгосрочной памяти.

ПРАВИЛА:
- Игнорируй small-talk ("привет", "спасибо", "ок")
- Фокусируйся на содержательных обсуждениях
- Выдели ключевые темы (tags)
- Создай краткий summary (2-4 предложения)
- Укажи период времени
- Сохрани ссылки на исходные логи (raw_log_ids)

ВХОД:
Диалоги за период {start_date} - {end_date}:
{raw_logs_content}

ВЫХОД:
Верни строго JSON:
{
  "time_bucket_start": "YYYY-MM-DD",
  "time_bucket_end": "YYYY-MM-DD",
  "tags": ["тема1", "тема2", "тема3"],
  "summary": "Краткое содержание обсуждений"
}

ПРИМЕРЫ ТЕГОВ:
- Названия проектов: "Trinity", "MaaS"
- Технологии: "Python", "PostgreSQL", "TypeScript"
- Темы: "Architecture", "Planning", "Bug fix", "Design"
- Активности: "Discussion", "Decision", "Learning"
```

---

## Схема базы данных

### Таблица 1: pipeline_runs
Управление жизненным циклом обработки запроса (State Machine).

```sql
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_query TEXT NOT NULL,

    -- State Machine
    status VARCHAR(50) DEFAULT 'NEW' CHECK (
        status IN ('NEW', 'ANALYZING', 'ANALYZED',
                   'ASSEMBLING', 'READY', 'RESPONDING',
                   'COMPLETED', 'FAILED')
    ),

    -- Промежуточные результаты
    analysis_result JSONB,
    final_context_payload TEXT,
    final_answer TEXT,

    -- Метаданные
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_user_id ON pipeline_runs(user_id);
CREATE INDEX idx_pipeline_runs_created_at ON pipeline_runs(created_at);
```

### Таблица 2: lsm_storage
Долгосрочная семантическая память (Long-term Semantic Memory).

```sql
CREATE TABLE lsm_storage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Временной якорь
    time_bucket_start DATE NOT NULL,
    time_bucket_end DATE NOT NULL,

    -- Семантика
    tags TEXT[] NOT NULL,
    summary TEXT NOT NULL,

    -- Ссылки на сырые данные
    raw_log_ids UUID[],

    -- Метаданные
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_lsm_time_bucket ON lsm_storage(time_bucket_start, time_bucket_end);
CREATE INDEX idx_lsm_tags ON lsm_storage USING GIN(tags);
CREATE INDEX idx_lsm_created_at ON lsm_storage(created_at);
```

### Таблица 3: system_prompts
Промпты для различных агентов (для возможности hot-swap без изменения кода).

```sql
CREATE TABLE system_prompts (
    role_name VARCHAR(50) PRIMARY KEY,
    prompt_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO system_prompts (role_name, prompt_template, version) VALUES
    ('Analyzer', 'см. раздел Модуль 4: Промпт', 1),
    ('Assembler', 'см. раздел Модуль 5: Промпт', 1),
    ('Archivist', 'см. раздел Модуль 7: Промпт', 1),
    ('FinalResponder', 'Базовая системная инструкция для AI-ментора', 1);
```

### Таблица 4: raw_logs
Сырой лог всех инференсов (запросов и ответов).

```sql
CREATE TABLE raw_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    message_type VARCHAR(50) NOT NULL CHECK (
        message_type IN ('user_query', 'assistant_response')
    ),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_raw_logs_user_id ON raw_logs(user_id);
CREATE INDEX idx_raw_logs_created_at ON raw_logs(created_at);
CREATE INDEX idx_raw_logs_message_type ON raw_logs(message_type);
```

### Триггер для LISTEN/NOTIFY

```sql
-- Функция для отправки уведомлений
CREATE OR REPLACE FUNCTION notify_pipeline_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'pipeline_events',
        json_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'operation', TG_OP
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер на изменение статуса
CREATE TRIGGER on_pipeline_change
AFTER INSERT OR UPDATE OF status ON pipeline_runs
FOR EACH ROW
EXECUTE FUNCTION notify_pipeline_change();
```

---

## Форматы данных

### 1. Формат analysis_result (JSON)
Выход Analyzer → Вход Assembler

```typescript
interface AnalysisResult {
  needs_context: boolean;
  context_type: 'GENERAL' | 'SPECIFIC_HISTORY';
  time_scope: 'hot' | 'warm' | 'cold';
  search_keywords: string[];
  context_found: {
    period: string | null;
    summary: string | null;
    relevance_score: number; // 0.0 - 1.0
    lsm_record_id: string | null; // UUID
  };
}
```

### 2. Формат final_context_payload (TEXT)
Выход Assembler → Вход Final Responder

```xml
<system>
[Системная инструкция для AI-ментора]
</system>

<context_from_history>
Период: [time_bucket]
[summary из LSM]
</context_from_history>

<current_query>
[user_query]
</current_query>
```

### 3. Формат LSM записи (JSON → JSONB в БД)
Выход Archivist → Таблица lsm_storage

```typescript
interface LSMRecord {
  time_bucket_start: string; // ISO date YYYY-MM-DD
  time_bucket_end: string;   // ISO date YYYY-MM-DD
  tags: string[];            // ['Python', 'Architecture', ...]
  summary: string;           // 2-4 предложения
  raw_log_ids: string[];     // UUIDs
}
```

### 4. Формат raw_logs записи
Вход Logger → Таблица raw_logs

```typescript
interface RawLogRecord {
  user_id: string; // UUID
  message_type: 'user_query' | 'assistant_response';
  content: string;
  metadata: {
    request_id: string; // UUID
    timestamp: string;  // ISO8601
    [key: string]: any; // дополнительные поля
  };
}
```

### 5. Формат NOTIFY события
PostgreSQL → Orchestrator

```typescript
interface PipelineEvent {
  id: string;     // UUID запроса
  status: 'NEW' | 'ANALYZED' | 'READY' | 'COMPLETED' | 'FAILED';
  operation: 'INSERT' | 'UPDATE';
}
```

---

## Диаграмма взаимодействия модулей

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ HTTP POST
       ↓
┌──────────────────┐
│ Request Handler  │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │ (async)
    ↓         ↓
┌─────────┐  ┌────────┐
│pipeline │  │raw_logs│
│ _runs   │  └────────┘
│(NEW)    │       ↑
└────┬────┘       │
     │ NOTIFY    │
     ↓           │
┌─────────────┐  │
│Orchestrator │  │
└──────┬──────┘  │
       │         │
   ┌───┴────┬────┴────┬─────────┐
   │        │         │         │
   ↓        ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌──────┐ ┌────────┐
│Analyzer│ │Assemb- │ │Final │ │Archi-  │
│        │ │ler     │ │Resp. │ │vist    │
└───┬────┘ └───┬────┘ └──┬───┘ └───┬────┘
    │          │         │         │
    ↓          ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│lsm_    │ │pipeline│ │pipeline│ │lsm_    │
│storage │ │_runs   │ │_runs   │ │storage │
│        │ │(READY) │ │(COMPL) │ │        │
└────────┘ └────────┘ └───┬────┘ └────────┘
                          │
                          ↓ (async)
                      ┌────────┐
                      │raw_logs│
                      └────────┘
```

---

## 8. Frontend Module (Post-MVP)

> **Примечание**: Frontend добавляется ПОСЛЕ завершения MVP (модули 1-7). MVP - это чисто backend система. Frontend - отдельный модуль для пользовательского интерфейса.

### Назначение
Обеспечить пользовательский интерфейс с аутентификацией, real-time обновлениями и удобным UX для взаимодействия с AI Mentor.

### Технологии
- **Framework**: React + Vite
- **State**: React Context / Zustand
- **UI**: Tailwind CSS / shadcn/ui
- **Supabase SDK**: @supabase/supabase-js, @supabase/auth-ui-react
- **Routing**: React Router
- **Markdown**: react-markdown

### Архитектура подключения

```
┌─────────────────────┐         ┌─────────────────────┐
│  Frontend (React)   │         │  Backend (Node.js)  │
│                     │         │                     │
│  Supabase SDK:      │         │  Direct Postgres:   │
│  • Auth             │         │  • LISTEN/NOTIFY    │
│  • Realtime         │         │  • Orchestrator     │
│  • Storage          │         │  • Agents           │
│  • RLS              │         │  • Triggers         │
│                     │         │                     │
│  SUPABASE_URL       │         │  DATABASE_URL       │
│  ANON_KEY           │         │                     │
└─────────────────────┘         └─────────────────────┘
         ↓                               ↓
    ┌─────────────────────────────────────────┐
    │      Supabase PostgreSQL Database       │
    └─────────────────────────────────────────┘
```

### Компоненты Frontend

#### 8.1 Authentication Module
**Функции**:
- Login/Signup через Supabase Auth
- Session management
- Protected routes
- User profile

**Требования**:
- REQ-FE-AUTH-1: Email + password аутентификация
- REQ-FE-AUTH-2: Автоматический refresh токенов
- REQ-FE-AUTH-3: Logout с очисткой сессии
- REQ-FE-AUTH-4: Защищенные роуты (redirect to login)

#### 8.2 Chat Interface
**Функции**:
- Отправка вопросов к AI
- Отображение ответов с markdown
- Показ статусов (analyzing, assembling, responding)
- История диалогов

**Требования**:
- REQ-FE-CHAT-1: Textarea с auto-resize
- REQ-FE-CHAT-2: Markdown rendering для ответов
- REQ-FE-CHAT-3: Индикаторы загрузки
- REQ-FE-CHAT-4: Scroll to bottom при новых сообщениях

#### 8.3 Realtime Updates
**Функции**:
- Подписка на изменения pipeline_runs через Supabase Realtime
- Live обновление статусов (NEW → ANALYZING → ANALYZED...)
- Уведомления о завершении

**Требования**:
- REQ-FE-RT-1: Subscribe к `pipeline_runs` WHERE user_id = current_user
- REQ-FE-RT-2: Обновлять UI при изменении status
- REQ-FE-RT-3: Reconnect при потере соединения
- REQ-FE-RT-4: Показывать connection status

#### 8.4 History & Search
**Функции**:
- Просмотр истории запросов
- Поиск по прошлым диалогам
- Группировка по датам
- Infinite scroll

**Требования**:
- REQ-FE-HIST-1: Загрузка последних 50 запросов
- REQ-FE-HIST-2: Поиск по user_query и final_answer
- REQ-FE-HIST-3: Группы: Today, Yesterday, This Week, Older
- REQ-FE-HIST-4: Lazy loading при скролле

#### 8.5 Admin Panel
**Функции**:
- Dashboard с метриками
- Управление system_prompts
- Просмотр всех pipeline_runs
- Мониторинг LSM storage

**Требования**:
- REQ-FE-ADMIN-1: Role-based access (только админы)
- REQ-FE-ADMIN-2: Редактор промптов (Monaco Editor)
- REQ-FE-ADMIN-3: Метрики: requests/day, avg response time, errors
- REQ-FE-ADMIN-4: Фильтры по статусам и датам

### Credentials Configuration

#### Frontend (.env.local)
```env
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

#### Backend (.env) - остаётся без изменений
```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-proj-...
```

### Row Level Security (RLS)

Для безопасности фронтенда нужно настроить RLS в Supabase:

```sql
-- Users can only see their own pipeline_runs
CREATE POLICY "Users see own runs"
ON pipeline_runs FOR SELECT
USING (auth.uid() = user_id);

-- Users can only insert their own runs
CREATE POLICY "Users insert own runs"
ON pipeline_runs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins see everything
CREATE POLICY "Admins see all"
ON pipeline_runs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
```

### Интеграция с Backend

Frontend НЕ взаимодействует напрямую с Orchestrator или Agents. Вся логика остаётся в backend.

**Frontend → Backend взаимодействие:**
1. User отправляет вопрос
2. Frontend создаёт запись в `pipeline_runs` (через Supabase SDK или REST API)
3. PostgreSQL trigger → NOTIFY → Orchestrator
4. Backend обрабатывает (как обычно)
5. Frontend получает updates через Supabase Realtime

**Почему такая архитектура:**
- ✅ Frontend использует Supabase фичи (Auth, RLS, Realtime)
- ✅ Backend использует LISTEN/NOTIFY (недоступен через SDK)
- ✅ Разделение ответственности
- ✅ Безопасность через RLS

---

## Итоговая таблица модулей

### MVP Modules (Backend Only)
| Модуль | Вход (откуда) | Обработка | Выход (куда) | Статус переход |
|--------|---------------|-----------|--------------|----------------|
| Request Handler | HTTP POST | Создание запроса | pipeline_runs | → NEW |
| Logger | Request Handler, Final Responder | Запись в лог | raw_logs | - |
| Orchestrator | PostgreSQL NOTIFY | Маршрутизация | Вызов агентов | - |
| Analyzer | pipeline_runs (NEW) | Анализ + поиск LSM | pipeline_runs.analysis_result | NEW → ANALYZED |
| Assembler | pipeline_runs (ANALYZED) | Сборка контекста | pipeline_runs.final_context_payload | ANALYZED → READY |
| Final Responder | pipeline_runs (READY) | Вызов LLM | pipeline_runs.final_answer | READY → COMPLETED |
| Archivist | raw_logs | Создание LSM | lsm_storage | - |

### Frontend Module (Post-MVP)
| Компонент | Вход (откуда) | Обработка | Выход (куда) | Технология |
|-----------|---------------|-----------|--------------|------------|
| Auth | Supabase Auth | Login/Signup | User session | @supabase/auth-ui-react |
| Chat UI | User input | Render messages | pipeline_runs (INSERT) | React + Markdown |
| Realtime | Supabase Realtime | Subscribe pipeline_runs | UI updates | Supabase subscriptions |
| History | pipeline_runs (SELECT) | Display + search | UI list | React Query |
| Admin Panel | All tables | Metrics + management | Updates | React + charts |

---

**Версия документа**: 2.0 (added Frontend Module)
**Дата**: 2025-11-25
**Статус**: MVP готов к реализации, Frontend - roadmap
