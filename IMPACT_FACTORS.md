# IMPACT FACTORS — Импакт-факторы системы MaaS

*Создано: 2025-11-26*

> **Импакт-фактор (ИФ)** — параметр системы, изменение которого приводит к измеримому изменению качества.
>
> Факторы отсортированы по убыванию значимости влияния на конечное качество системы.

---

## Сводная таблица

| # | Импакт-фактор | Влияние | Effort | Текущее состояние |
|---|---------------|---------|--------|-------------------|
| 1 | Retrieval Strategy | ⬛⬛⬛⬛⬛ | Высокий | Tags (наивный) |
| 2 | Keyword Extraction | ⬛⬛⬛⬛⬛ | Средний | Naive split |
| 3 | Archivist Tag Quality | ⬛⬛⬛⬛ | Средний | LLM extraction |
| 4 | top_k | ⬛⬛⬛⬛ | Низкий | 3 |
| 5 | System Prompt | ⬛⬛⬛ | Низкий | Generic |
| 6 | LLM Model | ⬛⬛⬛ | Низкий | gpt-4o-mini |
| 7 | Relevance/Recency Weights | ⬛⬛ | Низкий | 0.5/0.5 |
| 8 | Max Context Tokens | ⬛⬛ | Низкий | 4000 |
| 9 | Temperature | ⬛ | Низкий | 0.7 |

---

## ИФ #1: Retrieval Strategy

**Влияние:** ⬛⬛⬛⬛⬛ КРИТИЧЕСКОЕ

### Что это

Стратегия поиска релевантных memories в LSM:
- **Tags (текущее):** Exact match по semantic_tags
- **Vector:** Cosine similarity по embeddings
- **Hybrid:** Tags + Vector + LLM Reranker

### Почему #1 по значимости

**Retrieval — это фундамент всей системы.** Если retrieval плохой, качество ответов не может быть хорошим независимо от других факторов.

```
Плохой retrieval → Нерелевантный контекст → Плохой ответ
                 → Отсутствие контекста → LLM галлюцинирует
```

Это **архитектурный потолок качества**. Никакие настройки downstream не компенсируют плохой retrieval.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Retrieval Precision | Прямое (определяет) |
| Retrieval Recall | Прямое (определяет) |
| Hallucination Rate | Косвенное (нет контекста → галлюцинации) |
| Context Utilization | Косвенное (нерелевантный контекст не используется) |
| Response Quality | Прямое (качество контекста = качество ответа) |

### Текущее состояние vs Потенциал

| Стратегия | Precision | Recall | Сложность |
|-----------|-----------|--------|-----------|
| Tags (сейчас) | ~30% | ~20% | Реализовано |
| Vector (pgvector) | ~65% | ~70% | Средняя |
| Hybrid + Reranker | ~85% | ~80% | Высокая |

### Механизм влияния

```
Запрос: "What's my favorite programming language?"

Tags (текущее):
  Keywords: ["favorite", "programming", "language"]
  LSM search: semantic_tags && ARRAY['favorite', 'programming', 'language']
  Результат: 0 memories (теги не совпадают exact match)
  → LLM отвечает без контекста → галлюцинация

Vector (будущее):
  Embedding: query → [0.23, -0.45, 0.12, ...]
  LSM search: cosine_similarity(embedding, query_embedding) > 0.7
  Результат: 3 memories о программировании
  → LLM использует контекст → точный ответ
```

### Рекомендации по улучшению

1. **Краткосрочно:** Fuzzy tag matching (partial overlap, synonyms)
2. **Среднесрочно:** pgvector + embeddings (ada-002)
3. **Долгосрочно:** Hybrid retrieval + LLM reranker

---

## ИФ #2: Keyword Extraction Quality

**Влияние:** ⬛⬛⬛⬛⬛ КРИТИЧЕСКОЕ

### Что это

Процесс извлечения ключевых слов из пользовательского запроса для поиска в LSM.

Текущая реализация (наивная):
```typescript
const keywords = query.toLowerCase()
  .split(/\s+/)
  .filter(word => word.length > 3);
```

### Почему #2 по значимости

**Keywords — это входная точка в retrieval.** Даже идеальный LSM с идеальным vector search ничего не найдёт, если мы ищем не то.

```
Плохие keywords → Поиск не того → 0 results или irrelevant results
```

Это **bottleneck перед retrieval**. Garbage in = Garbage out.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Retrieval Recall | Прямое (не те keywords = не найдём) |
| Retrieval Precision | Косвенное (слишком широкие keywords = шум) |
| Hit Rate | Прямое (плохие keywords = 0 hits) |

### Текущее состояние vs Потенциал

```
Запрос: "What programming language should I learn for my career?"

Текущее извлечение (наивное):
  ["what", "programming", "language", "should", "learn", "career"]
  Проблемы:
  - "what", "should" — мусор
  - Нет synonyms: "coding", "development"
  - Нет intent: "career advice", "learning path"

Идеальное извлечение (LLM-based):
  Primary: ["programming", "language", "career"]
  Expanded: ["coding", "development", "skills", "job", "learning"]
  Intent: ["career-advice", "education", "technology-choice"]
```

### Механизм влияния

```
Сценарий A: Наивное извлечение
  Query: "Should I use Python or JavaScript?"
  Keywords: ["should", "python", "javascript"]
  LSM tags: ["python", "preferences", "coding"]
  Overlap: 1 (только "python")
  Result: Может не найти или низкий score

Сценарий B: Умное извлечение
  Query: "Should I use Python or JavaScript?"
  Keywords: ["python", "javascript", "programming", "choice", "comparison"]
  LSM tags: ["python", "preferences", "coding"]
  Overlap: 2+ (python + coding/programming как synonym)
  Result: Находит релевантную память
```

### Рекомендации по улучшению

1. **Краткосрочно:** Стоп-слова + лемматизация
2. **Среднесрочно:** LLM extraction (попросить GPT извлечь keywords)
3. **Долгосрочно:** Query expansion (synonyms, related concepts)

**LLM-based extraction prompt:**
```
Extract search keywords from this query.
Return primary keywords and expanded related terms.

Query: "{query}"

JSON response:
{
  "primary": ["keyword1", "keyword2"],
  "expanded": ["related1", "related2"],
  "intent": ["what user is trying to find"]
}
```

---

## ИФ #3: Archivist Tag Quality

**Влияние:** ⬛⬛⬛⬛ ВЫСОКОЕ

### Что это

Качество semantic_tags, которые Archivist присваивает при сохранении памяти в LSM.

Текущая реализация:
```typescript
// LLM prompt для извлечения тегов
"Extract 3-5 semantic tags that capture the key topics..."
```

### Почему #3 по значимости

**Archivist определяет, что будет найдено в будущем.** Плохие теги при записи = невозможность найти потом.

```
Плохие теги при записи → Память "похоронена" в LSM → Никогда не будет найдена
```

Это **долгосрочный эффект**. Каждая плохая запись влияет на все будущие запросы навсегда.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Retrieval Recall (будущий) | Прямое (плохие теги = не найдём) |
| Memory Utilization | Прямое (unused memories = wasted storage) |
| LSM Quality | Прямое (garbage accumulation) |

### Текущее состояние vs Потенциал

```
Диалог о Python:
User: "I really love Python, it's my favorite language"
AI: "Python is great for many use cases..."

Плохие теги (generic):
  ["conversation", "user", "programming", "question"]
  Проблема: Слишком общие, не захватывают суть

Хорошие теги (specific):
  ["python", "favorite-language", "user-preference", "programming"]
  Преимущество: Конкретные, найдутся при релевантном запросе

Отличные теги (semantic):
  ["python", "language-preference", "positive-sentiment", "coding-tools"]
  Преимущество: Семантически богатые, найдутся даже при косвенных запросах
```

### Механизм влияния

```
Запись в LSM:
  Summary: "User prefers Python for its readability"

  Плохие теги: ["conversation", "programming"]
  → Запрос "What's my favorite language?" не найдёт (нет "favorite", "language")

  Хорошие теги: ["python", "favorite", "language", "preference", "readability"]
  → Запрос найдёт по overlap с "favorite", "language"
```

### Рекомендации по улучшению

1. **Краткосрочно:** Улучшить prompt для Archivist (конкретнее, с примерами)
2. **Среднесрочно:** Two-pass tagging (extract + validate)
3. **Долгосрочно:** Tag taxonomy + controlled vocabulary

**Улучшенный prompt:**
```
Extract semantic tags for this conversation summary.

Rules:
- Include specific entities (names, technologies, places)
- Include user preferences and opinions
- Include action types (question, decision, learning)
- Avoid generic tags like "conversation", "user", "chat"
- Use lowercase, hyphenated format

Summary: "{summary}"

Return 5-7 tags as JSON array.
```

---

## ИФ #4: top_k

**Влияние:** ⬛⬛⬛⬛ ВЫСОКОЕ

### Что это

Количество memories, которые берутся из LSM для формирования контекста.

Текущее значение: `top_k = 3`

### Почему #4 по значимости

**top_k напрямую контролирует precision/recall trade-off.** Это самый простой способ влиять на баланс между "найти всё релевантное" и "не добавить шум".

```
top_k ↑ → Recall ↑, Precision ↓ → Больше шума → Hallucinations ↑
top_k ↓ → Recall ↓, Precision ↑ → Пропускаем релевантное → Incomplete answers
```

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Retrieval Precision | Обратное (больше k = меньше precision) |
| Retrieval Recall | Прямое (больше k = больше recall) |
| Hallucination Rate | Косвенное (больше шума = больше путаницы) |
| Latency | Прямое (больше контекста = дольше обработка) |
| Token Cost | Прямое (больше контекста = больше токенов) |

### Текущее состояние vs Варианты

| top_k | Precision | Recall | Hallucination Risk | Use Case |
|-------|-----------|--------|-------------------|----------|
| 1 | Высокая | Низкий | Низкий | Точечные факты |
| 2 | Высокая | Средний | Низкий | Баланс для точных запросов |
| 3 (текущее) | Средняя | Средний | Средний | Общий баланс |
| 5 | Средняя | Высокий | Высокий | Сложные multi-topic запросы |
| 10 | Низкая | Высокий | Очень высокий | Не рекомендуется |

### Механизм влияния

```
Запрос: "What programming languages do I know?"

LSM содержит (по релевантности):
1. "User knows Python well" (score: 0.9) ✓ Релевантно
2. "User is learning JavaScript" (score: 0.7) ✓ Релевантно
3. "User asked about Go" (score: 0.5) ✗ Нерелевантно (только спрашивал)
4. "User mentioned Java in passing" (score: 0.3) ✗ Нерелевантно

top_k = 2: Берём 1, 2 → Точный ответ: "Python and JavaScript"
top_k = 4: Берём 1, 2, 3, 4 → Шумный ответ: "Python, JavaScript, Go, Java"
```

### Рекомендации по улучшению

1. **Эксперимент:** A/B тест top_k = 2 vs 3 vs 4
2. **Динамический top_k:** Зависит от confidence score первых результатов
3. **Threshold вместо top_k:** Брать все с score > 0.6

---

## ИФ #5: System Prompt

**Влияние:** ⬛⬛⬛ СРЕДНЕЕ

### Что это

Системный промпт, который определяет поведение LLM при генерации ответа.

Текущий:
```
You are a helpful AI assistant with access to long-term memory about the user.
```

### Почему #5 по значимости

**System prompt определяет, как LLM использует (или злоупотребляет) контекстом.** Плохой prompt → LLM галлюцинирует или игнорирует контекст.

```
Плохой prompt: "You have memory" → LLM выдумывает "воспоминания"
Хороший prompt: "Use ONLY provided context" → LLM честно говорит "не знаю"
```

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Hallucination Rate | Прямое (prompt определяет поведение) |
| Context Utilization | Прямое (инструкции по использованию) |
| Response Style | Прямое (тон, формат, длина) |

### Текущее состояние vs Потенциал

```
Текущий prompt (проблемный):
"You are an AI with long-term memory about the user."
→ LLM думает, что ДОЛЖЕН помнить → выдумывает

Улучшенный prompt:
"You are an AI assistant. You may receive context from previous conversations.

Rules:
1. Use ONLY the context provided below to answer questions about the user
2. If no relevant context is provided, say "I don't have information about that"
3. NEVER invent or assume facts about the user
4. Clearly distinguish between what you know from context vs general knowledge"
```

### Механизм влияния

```
Запрос: "What's my favorite color?"
Контекст: (пусто — нет информации о цвете)

Плохой prompt: "You have memory about the user"
→ LLM: "Based on our conversations, you seem to prefer blue..."
→ ГАЛЛЮЦИНАЦИЯ

Хороший prompt: "Use ONLY provided context, say 'I don't know' if missing"
→ LLM: "I don't have information about your favorite color."
→ ЧЕСТНЫЙ ОТВЕТ
```

### Рекомендации по улучшению

1. **Немедленно:** Переписать prompt с явными правилами
2. **A/B тест:** Сравнить hallucination rate
3. **Версионирование:** Хранить prompt versions в system_prompts table

---

## ИФ #6: LLM Model

**Влияние:** ⬛⬛⬛ СРЕДНЕЕ

### Что это

Выбор модели для генерации ответа: gpt-4o-mini vs gpt-4o vs другие.

Текущее: `gpt-4o-mini`

### Почему #6 по значимости

**Модель определяет качество reasoning и следования инструкциям.** Более мощная модель лучше использует контекст и реже галлюцинирует.

```
gpt-4o-mini: Быстро, дёшево, но может игнорировать сложные инструкции
gpt-4o: Медленнее, дороже, но лучше reasoning и instruction following
```

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Response Quality | Прямое (качество reasoning) |
| Instruction Following | Прямое (сложные prompts) |
| Hallucination Rate | Косвенное (лучшая модель = меньше ошибок) |
| Latency | Прямое (bigger model = slower) |
| Cost | Прямое (4o стоит ~10x больше mini) |

### Текущее состояние vs Варианты

| Модель | Quality | Latency | Cost/1K tokens | Use Case |
|--------|---------|---------|----------------|----------|
| gpt-4o-mini | Good | ~500ms | $0.00015 | Default, simple queries |
| gpt-4o | Excellent | ~2s | $0.0025 | Complex reasoning |
| gpt-4-turbo | Very Good | ~1.5s | $0.001 | Balance |

### Рекомендации по улучшению

1. **Adaptive model selection:** Simple queries → mini, Complex → 4o
2. **Cost budget:** Track spending, switch to mini if over budget
3. **Quality threshold:** If mini fails quality check, retry with 4o

---

## ИФ #7: Relevance/Recency Weights

**Влияние:** ⬛⬛ НИЗКО-СРЕДНЕЕ

### Что это

Веса для scoring memories при ранжировании:
- **relevance_weight:** Насколько важно совпадение тегов
- **recency_weight:** Насколько важна свежесть памяти

Текущее: `relevance = 0.5, recency = 0.5`

### Почему #7 по значимости

**Влияет только когда есть много memories для выбора.** При малом LSM эффект минимален. Становится важнее по мере роста базы.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Retrieval Precision | Косвенное (правильный ranking) |
| Temporal Accuracy | Прямое (recency для time-sensitive queries) |

### Варианты

| Сценарий | Рекомендация |
|----------|--------------|
| Factual queries ("What's my email?") | relevance: 0.8, recency: 0.2 |
| Recent events ("What did we discuss yesterday?") | relevance: 0.3, recency: 0.7 |
| Default | relevance: 0.5, recency: 0.5 |

### Рекомендации по улучшению

1. **Query-dependent weights:** Определять по типу запроса
2. **Experiment:** A/B тест разных комбинаций
3. **User-specific:** Некоторые users предпочитают свежее

---

## ИФ #8: Max Context Tokens

**Влияние:** ⬛⬛ НИЗКО-СРЕДНЕЕ

### Что это

Максимальное количество токенов, выделенное под контекст из LSM.

Текущее: `4000 tokens`

### Почему #8 по значимости

**Ограничивает, сколько memories влезет в контекст.** При малом LSM не критично. Важно при большом количестве релевантных memories.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Context Completeness | Прямое (больше токенов = больше контекста) |
| Cost | Прямое (больше токенов = дороже) |
| Latency | Косвенное (больше контекста = дольше обработка) |

### Варианты

| Limit | Примерно memories | Use Case |
|-------|-------------------|----------|
| 1000 | 2-3 short | Минимальный контекст, дёшево |
| 4000 (текущее) | 5-8 medium | Баланс |
| 8000 | 10-15 medium | Максимальный контекст |
| 16000 | 20+ | Для complex multi-topic queries |

---

## ИФ #9: Temperature

**Влияние:** ⬛ НИЗКОЕ

### Что это

Параметр "креативности" LLM. Низкая температура = детерминированные ответы, высокая = вариативные.

Текущее: `0.7`

### Почему #9 по значимости

**Минимальный эффект на качество ответов в контексте memory system.** Влияет больше на стиль, чем на точность.

### На что влияет

| Метрика | Влияние |
|---------|---------|
| Response Consistency | Прямое (низкая temp = consistent) |
| Creativity | Прямое (высокая temp = varied) |
| Hallucination Risk | Слабое (высокая temp может увеличить) |

### Рекомендации

| Use Case | Temperature |
|----------|-------------|
| Factual answers | 0.3 |
| General conversation | 0.7 |
| Creative tasks | 0.9 |

---

## Взаимосвязи между факторами

```
                    ┌─────────────────────┐
                    │  Response Quality   │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │ Context      │    │ LLM          │    │ Prompt       │
    │ Quality      │    │ Capability   │    │ Quality      │
    └──────┬───────┘    └──────────────┘    └──────────────┘
           │                   │                   │
           │                   │                   │
           │            ┌──────┴──────┐            │
           │            │   Model     │            │
           │            │   Choice    │            │
           │            └─────────────┘            │
           │                                       │
           ▼                                       ▼
    ┌──────────────┐                        ┌──────────────┐
    │  Retrieval   │                        │   System     │
    │  Quality     │                        │   Prompt     │
    └──────┬───────┘                        └──────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐ ┌─────────┐
│Retrieval│ │Keyword  │
│Strategy │ │Extract  │
└─────────┘ └────┬────┘
                 │
                 ▼
          ┌──────────────┐
          │  Archivist   │
          │  Tag Quality │
          └──────────────┘
```

---

## Приоритеты для экспериментов

### Must Do First (максимальный ROI)

1. **System Prompt** — Zero cost, потенциально большой эффект на hallucinations
2. **top_k A/B тест** — Легко измерить, быстрый feedback loop
3. **Keyword Extraction** — Улучшить через LLM, средний effort

### Should Do

4. **Archivist Prompt** — Улучшить качество тегов
5. **Relevance/Recency weights** — A/B тест комбинаций

### Strategic (требует инфраструктуры)

6. **Vector Retrieval** — pgvector + embeddings
7. **Hybrid Search** — Комбинация strategies
8. **Adaptive Model Selection** — mini vs 4o по сложности

---

## Связанные документы

- [SELFLEARN.md](./SELFLEARN.md) — Система самообучения и эксперименты
- [IDEAS.md](./IDEAS.md) — Идеи для улучшения
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Текущая архитектура

---

*Этот документ — справочник по импакт-факторам для планирования экспериментов*
