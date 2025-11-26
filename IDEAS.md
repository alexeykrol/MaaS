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

## Приоритезация (первичная)

### Must Have (для "умной" памяти)
1. Vector embeddings + pgvector
2. User profile entity
3. Retrieval quality metrics
4. Memory isolation audit

### Should Have
5. Temporal reasoning
6. Preference extraction
7. Async Archivist
8. User data control (GDPR)

### Nice to Have
9. Multi-hop retrieval
10. Memory decay
11. A/B testing framework
12. Memory transparency UI

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
