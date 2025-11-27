# IDEAS — Идеи для развития MaaS

> Этот файл — коллекция идей, гипотез и потенциальных улучшений.
> Не всё здесь будет реализовано, но всё стоит обдумать.

*Создан: 2025-11-26*
*Статус: Активный сбор идей*

---

## Как использовать этот файл

- **[ГИПОТЕЗА]** — непроверенная идея, требует исследования
- **[РЕШЕНИЕ]** — известный подход, можно реализовать
- **[ВОПРОС]** — открытый вопрос без ответа
- **[ПРИОРИТЕТ]** — важно для качества системы

После проработки идеи переносятся в BACKLOG.md как конкретные задачи.

---

## 0. Честная оценка текущего состояния

> **"Память для бедных"** — так можно охарактеризовать текущую реализацию.

### Что у нас сейчас

```
Запрос: "What is the meaning of life?"
          ↓
Keyword extraction: [meaning, life]  ← просто убрали стоп-слова
          ↓
SQL: WHERE semantic_tags && ['meaning', 'life']  ← exact string match
          ↓
Результат: 0 memories

Почему 0? Потому что в LSM теги = ['philosophy', 'existentialism']
"meaning" ≠ "philosophy" как строки, хотя семантически связаны.
```

### Фундаментальные проблемы

| Проблема | Что происходит | Почему это плохо |
|----------|----------------|------------------|
| **Keyword extraction наивный** | `"I love Python"` → `[love, python]` | "love" бесполезно, засоряет поиск |
| **Tag matching — exact** | `"ethics"` не найдёт `["morality"]` | Синонимы не работают |
| **Нет semantic similarity** | `"смысл жизни"` ≠ `"экзистенциализм"` | Связанные концепции не матчатся |
| **Summarization теряет детали** | `"Я предпочитаю Python"` → `"обсуждали программирование"` | Конкретное предпочтение потеряно |
| **Теги зависят от LLM** | Одна тема → разные теги в разных диалогах | Inconsistent retrieval |
| **Нет temporal reasoning** | `"вчера мы говорили..."` | Система не понимает "вчера" |
| **Нет user model** | Храним диалоги, не строим модель юзера | Нет понимания кто юзер |

### Уровни "умности" памяти

| Уровень | Описание | Мы здесь? |
|---------|----------|-----------|
| **Level 1** | Tag-based search (exact match) | ✅ Да, мы тут |
| **Level 2** | Vector/Embedding search (semantic) | ❌ Нужно |
| **Level 3** | Hierarchical Memory (working/episodic/semantic) | ❌ Будущее |
| **Level 4** | Memory with reasoning (multi-hop, learning) | ❌ Исследование |

### Вердикт

Текущая система — **работающий прототип**, но называть это "памятью" — преувеличение.

Это **"поиск по тегам с LLM-суммаризацией"**.

Для демо — достаточно. Для реального агента с памятью на недели/месяцы — **недостаточно**.

---

## 1. Память и поиск

### 1.1 Semantic Search вместо Tag Matching

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

**Проблема:** Текущий поиск — exact match по тегам. "meaning of life" не находит память с тегом "philosophy".

**Решение:** Vector embeddings + cosine similarity

```
Текст → Embedding (1536 dim vector) → Хранение в pgvector
Поиск: query embedding <-> stored embeddings → top-K по близости
```

**Технологии:**
- OpenAI `text-embedding-ada-002` (~$0.0001 / 1K tokens)
- pgvector extension для Supabase
- Альтернатива: локальные embeddings (sentence-transformers)

**Гипотеза:** Semantic search даст 3-5x улучшение релевантности retrieval.

---

### 1.2 Hybrid Search (Keywords + Vectors)

**[ГИПОТЕЗА]**

Чистый vector search может пропустить точные совпадения (имена, даты, термины).

**Идея:** Комбинировать:
1. Vector similarity (семантика)
2. BM25 / keyword search (точные термины)
3. Weighted combination

**Вопрос:** Какие веса оптимальны? Нужны эксперименты.

---

### 1.3 Hierarchical Memory

**[ГИПОТЕЗА]**

Человеческая память многоуровневая. Наша — плоская.

**Идея:**
```
Working Memory    — текущий контекст (последние 2-3 сообщения)
Episodic Memory   — конкретные разговоры (как сейчас LSM)
Semantic Memory   — обобщённые знания о юзере (профиль)
Procedural Memory — как юзер предпочитает взаимодействовать
```

**Вопрос:** Как организовать переход между уровнями? Memory consolidation?

---

### 1.4 Memory Importance Scoring

**[ГИПОТЕЗА]**

Не все воспоминания равны. Факт "юзер любит Python" важнее чем "юзер спросил про погоду".

**Идея:** Scoring при создании памяти:
- Содержит ли личные предпочтения? (+10)
- Содержит ли факты о юзере? (+8)
- Содержит ли эмоции? (+5)
- Просто информационный запрос? (+1)

**Использование:** При retrieval сортировать по `relevance * importance`.

---

### 1.5 Memory Decay & Consolidation

**[ГИПОТЕЗА]**

Память должна "забывать" неважное и укреплять важное.

**Идея:**
- Memories имеют `strength` score
- При каждом retrieval: если memory использована → strength++
- Периодически: удалять memories с низким strength
- Consolidation: объединять похожие memories в одну обобщённую

**Вопрос:** Опасно ли терять информацию? Нужен ли "архив"?

---

## 2. User Modeling

### 2.1 User Profile Entity

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

**Проблема:** Мы храним диалоги, но не строим модель юзера.

**Идея:** Отдельная таблица `user_profiles`:
```sql
user_profiles:
  - user_id
  - preferences: JSONB      -- {"language": "Python", "style": "concise"}
  - knowledge_level: JSONB  -- {"programming": "advanced", "philosophy": "beginner"}
  - interests: TEXT[]       -- ["AI", "startups", "philosophy"]
  - communication_style     -- "formal" | "casual" | "technical"
  - updated_at
```

**Обновление:** После каждого диалога Archivist обновляет профиль.

---

### 2.2 Preference Extraction

**[ГИПОТЕЗА]**

Юзер говорит: "Я предпочитаю короткие ответы" → система должна это запомнить и применять.

**Идея:** Специальный prompt для Archivist:
```
Extract any user preferences from this conversation:
- Communication preferences (length, style, language)
- Topic preferences (interests, dislikes)
- Factual information about user (job, location, expertise)
```

**Вопрос:** Как надёжно различить временное предпочтение vs постоянное?

---

### 2.3 Adaptive Response Style

**[ГИПОТЕЗА]**

Система должна адаптировать стиль ответа под юзера.

**Идея:** На основе user profile:
- Уровень знаний → глубина объяснений
- Стиль общения → формальность
- Предпочтения → длина ответов

**Реализация:** Динамический system prompt на основе профиля.

---

## 3. Context & Retrieval

### 3.1 Multi-hop Retrieval

**[ГИПОТЕЗА]**

Иногда нужная информация не в одной памяти, а в цепочке.

**Пример:**
- Memory A: "Юзер работает в компании X"
- Memory B: "Компания X занимается AI"
- Query: "Что ты знаешь о моей работе?"
- Нужно: A → B → "Ты работаешь в AI компании X"

**Идея:** Iterative retrieval с расширением контекста.

**Вопрос:** Как избежать "hallucination chains"?

---

### 3.2 Temporal Reasoning

**[ПРИОРИТЕТ] [ГИПОТЕЗА]**

**Проблема:** Система не понимает "вчера", "на прошлой неделе", "в начале нашего разговора".

**Идея:**
- Парсить временные референсы в запросе
- Фильтровать LSM по времени
- Понимать относительное время ("раньше ты говорил...")

**Сложность:** NLP для temporal expressions.

---

### 3.3 Conversation Flow Awareness

**[ГИПОТЕЗА]**

**Проблема:** "Расскажи подробнее" — система не знает о чём.

**Идея:** Хранить "current topic" в pipeline_run:
```
current_topic: "existentialism"
topic_history: ["meaning of life", "philosophy", "existentialism"]
```

**Использование:** При vague queries использовать current_topic для retrieval.

---

### 3.4 Retrieval Feedback Loop

**[ГИПОТЕЗА]**

Мы не знаем, были ли retrieved memories полезны.

**Идея:**
- После ответа: анализировать, использовал ли LLM контекст
- Если да → увеличить relevance score этой памяти
- Если нет → уменьшить

**Сложность:** Как определить "использовал"? Heuristics или LLM judge?

---

## 4. Качество и оценка

### 4.1 Retrieval Quality Metrics

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

**Проблема:** Мы не измеряем качество retrieval.

**Метрики:**
- Precision@K: сколько из K retrieved memories релевантны?
- Recall: сколько релевантных memories мы нашли?
- MRR (Mean Reciprocal Rank): на каком месте первая релевантная?

**Реализация:** Test dataset с labeled relevant memories.

---

### 4.2 Response Quality Metrics

**[ГИПОТЕЗА]**

**Метрики:**
- Использует ли ответ предоставленный контекст?
- Консистентен ли ответ с прошлыми ответами?
- Нет ли противоречий с известными фактами о юзере?

**Идея:** LLM-as-judge для автоматической оценки.

---

### 4.3 A/B Testing Framework

**[РЕШЕНИЕ]**

Для проверки гипотез нужен A/B testing.

**Идея:**
- Флаги в user profile: `experiment_group: "A" | "B"`
- Разные стратегии retrieval/response для групп
- Сбор метрик и сравнение

---

## 5. Архитектура и производительность

### 5.1 Async Archivist

**[РЕШЕНИЕ]**

**Проблема:** Archivist блокирует после COMPLETED.

**Идея:** Archivist работает асинхронно:
- COMPLETED → сразу возвращаем ответ юзеру
- Background job создаёт память
- Отдельный процесс для archiving

---

### 5.2 Caching Layer

**[РЕШЕНИЕ]**

Частые запросы к одним и тем же memories.

**Идея:**
- Redis cache для hot memories
- Cache invalidation при обновлении
- TTL based on access frequency

---

### 5.3 Batch Embedding Generation

**[РЕШЕНИЕ]**

Если переходим на vectors — нужно batch processing.

**Идея:**
- Queue для новых memories
- Batch API call к OpenAI (дешевле)
- Background worker для embedding generation

---

### 5.4 Externalized Config (impact_values)

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

> *Добавлено: 2025-11-26*

**Проблема:** Сейчас все параметры (top_k, temperature, weights) hardcoded в коде агентов. Tuner не сможет их менять без модификации исходников.

**Идея:** Вынести все tunable параметры в таблицу `impact_values`:

```sql
CREATE TABLE impact_values (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Агенты читают параметры:**
```typescript
const topK = await getImpact('top_k');  // вместо const topK = 3;
```

**Преимущества:**
- Tuner делает простой `UPDATE` вместо модификации кода
- Нет пересборки / редеплоя
- Чистое версионирование (experiment_parameters → impact_values)
- MaaS остаётся изолированным — просто читает свой конфиг

**Когда делать:** Prerequisite для Step 15 (Tuner). Без этого рефакторинга Tuner будет хрупким.

**См. также:** IMPACTS.md, секция 0.2

---

## 6. Безопасность и приватность

### 6.1 Memory Isolation

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

**Критично:** Память юзера A никогда не должна попасть к юзеру B.

**Текущее:** `WHERE user_id = $1` — но нужен audit.

**Идея:**
- Row Level Security (RLS) в Supabase
- Audit log для всех memory accesses
- Тесты на isolation

---

### 6.2 Sensitive Data Detection

**[ГИПОТЕЗА]**

Юзер может случайно сказать пароль, номер карты, etc.

**Идея:**
- PII detection перед сохранением в LSM
- Redaction или отказ от сохранения
- User control: "забудь это"

---

### 6.3 User Data Control

**[РЕШЕНИЕ]**

GDPR compliance: юзер должен иметь контроль.

**Функции:**
- Просмотр всех memories
- Удаление конкретной памяти
- "Forget everything" — полный wipe
- Export data

---

## 7. UX идеи

### 7.1 Memory Transparency

**[ГИПОТЕЗА]**

Юзер хочет знать: "Почему ты это помнишь?"

**Идея:** UI показывает:
- Какие memories использованы в ответе
- Когда они были созданы
- Возможность исправить/удалить

---

### 7.2 Explicit Memory Commands

**[РЕШЕНИЕ]**

Юзер может явно управлять памятью:
- "Запомни: я предпочитаю Python"
- "Забудь, что я говорил о работе"
- "Что ты помнишь обо мне?"

**Реализация:** Intent detection → special handlers.

---

### 7.3 Memory Summary on Demand

**[РЕШЕНИЕ]**

Команда: "Подведи итог наших разговоров"

**Реализация:** LLM summarization всех LSM records юзера.

---

## 8. Идеи от Codex

> *Добавлено: 2025-11-26*

### 8.1 Hybrid Reranker

**[ПРИОРИТЕТ] [ГИПОТЕЗА]**

После vector/BM25 retrieval — LLM-judge для отсева шума и ранжирования релевантности.

**Зачем:** Особенно важно на мульти-тематичных логах, где vector search может вернуть "похожее, но не то".

**Реализация:**
1. Retrieve top-20 candidates (fast, cheap)
2. LLM reranker: "Which of these are relevant to: {query}?" → top-5
3. Use top-5 in context

---

### 8.2 Topic Graph

**[ГИПОТЕЗА]**

Поверх LSM хранить граф связей: `topic → facts → entities`.

**Зачем:** Multi-hop retrieval без галлюцинаций. Консолидация в узлы.

**Пример:**
```
[User: John] --works_at--> [Company: Acme]
     |                           |
     +--prefers--> [Lang: Python]
                                 |
[Company: Acme] --industry--> [AI/ML]
```

**Query:** "What do I do?" → traverse graph → "You work at Acme (AI company), prefer Python"

---

### 8.3 Cold Start Seeding

**[РЕШЕНИЕ]**

Быстрый импорт внешних знаний в LSM:
- Файлы (PDF, MD, TXT)
- Notion pages
- Google Drive docs

**Реализация:**
1. Document ingestion pipeline
2. Chunking + auto-tagging (LLM)
3. Embedding generation
4. Bulk insert в LSM с `source_type: "imported"`

**Зачем:** Юзер может сразу "загрузить контекст" без долгих разговоров.

---

### 8.4 Cost/Latency Budget

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

Планировщик вызовов LLM в зависимости от запроса и нагрузки.

**Идея:**
| Сценарий | Модель | Причина |
|----------|--------|---------|
| Simple query | gpt-4o-mini | Дешево, быстро |
| Complex reasoning | gpt-4o | Качество важнее |
| Summarization | gpt-4o-mini | Batch, не срочно |
| Reranking | gpt-4o-mini | Много вызовов |
| High load | fallback to mini | Cost control |

**Реализация:** Router на основе query complexity + current load.

---

### 8.5 RLS/Tenant Tests

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

Автотесты на изоляцию `user_id`:
- SQL-level: RLS policies в Supabase
- Integration: попытка доступа к чужим данным
- Regression: запускать при каждом PR

**Зачем:** Не сломать privacy при изменениях кода.

**Тесты:**
```typescript
// User A создаёт memory
// User B пытается получить → должен получить 0
// User A получает → должен получить 1
```

---

### 8.6 Safety Filter перед LSM

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

PII/секреты — detect/redact перед сохранением.

**Реализация:**
1. Regex patterns: email, phone, SSN, credit card, API keys
2. LLM classifier: "Does this contain sensitive personal info?"
3. Action: redact, warn user, or refuse to store

**Пример:**
```
Input: "My password is qwerty123"
Detected: password pattern
Action: "[REDACTED: password]" или отказ от сохранения
```

---

### 8.7 Feedback Capture

**[РЕШЕНИЕ]**

Пользователю: "Это было полезно?" → обновление weights.

**Реализация:**
- UI: thumbs up/down после ответа
- Backend: update `memory.strength` для использованных memories
- Effect: при следующем retrieval — релевантные выше

**Данные:**
```sql
memory_feedback:
  - memory_id
  - pipeline_run_id
  - rating: 1 (helpful) / -1 (not helpful)
  - created_at
```

---

### 8.8 Telemetry для памяти

**[ПРИОРИТЕТ] [РЕШЕНИЕ]**

Метрики для понимания как работает память:

| Метрика | Описание |
|---------|----------|
| `lsm_hit_rate` | % запросов где нашлись memories |
| `lsm_miss_rate` | % запросов без memories |
| `context_usage_rate` | % ответов где LLM использовал контекст |
| `naked_response_rate` | % "голых" ответов без памяти |
| `avg_memories_per_query` | Среднее кол-во memories в контексте |
| `retrieval_latency_p50/p99` | Время поиска |

**Реализация:** Prometheus metrics + Grafana dashboard.

---

## Приоритезация (обновлённая)

### Must Have (критично для качества)
1. **Vector embeddings + pgvector** — без этого нет semantic search
2. **Telemetry для памяти** — без метрик не понять что работает
3. **RLS/Tenant Tests** — безопасность прежде всего
4. **Safety Filter (PII)** — не хранить секреты
5. **Hybrid Reranker** — отсев шума после retrieval

### Should Have (значительное улучшение)
6. User profile entity
7. Retrieval quality metrics
8. Cost/Latency Budget (model router)
9. Feedback Capture (thumbs up/down)
10. Temporal reasoning
11. Cold Start Seeding (import docs)

### Nice to Have (продвинутое)
12. Topic Graph (knowledge graph)
13. Multi-hop retrieval
14. Memory decay & consolidation
15. A/B testing framework
16. Memory transparency UI

---

## Открытые вопросы

1. **Какой embedding model лучше?** OpenAI ada-002 vs open-source alternatives?
2. **Как измерять "качество памяти"?** Нужен benchmark dataset.
3. **Когда memory consolidation?** Batch job или online?
4. **Как балансировать privacy vs personalization?**
5. **Локальные embeddings vs API?** Latency vs cost vs privacy.

---

## Ресурсы для изучения

- [MemGPT Paper](https://arxiv.org/abs/2310.08560) — OS-like memory management for LLMs
- [Generative Agents](https://arxiv.org/abs/2304.03442) — Memory stream architecture
- [LangChain Memory](https://python.langchain.com/docs/modules/memory/) — Practical implementations
- [pgvector](https://github.com/pgvector/pgvector) — Vector similarity for Postgres

---

*Этот файл живой — добавляй идеи по мере появления!*
