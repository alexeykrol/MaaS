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

### Reranker (LLM-Judge) — ключевой компонент

> *Добавлено от Codex: 2025-11-26*

**Reranker** — LLM-based фильтр, который отсеивает шум после первичного retrieval.

```
Pipeline с Reranker:
  1. Retrieval (fast): получить top-20 candidates
  2. Reranker (LLM): "Which of these are relevant to: {query}?"
  3. Final: top-5 отфильтрованных → в контекст
```

**Почему критичен при Hybrid Search:**

| Этап | Precision | Recall | Latency |
|------|-----------|--------|---------|
| Vector только | 65% | 70% | Fast |
| Vector + Reranker | 85% | 70% | +500ms |
| Hybrid + Reranker | 90% | 80% | +700ms |

**Reranker Prompt:**
```
Given the query: "{query}"

Rank these memories by relevance (1 = most relevant):
{memories}

Return JSON: [{"id": "...", "rank": 1, "relevant": true}, ...]
Only include memories with relevant=true in final context.
```

**Trade-off:** Добавляет latency (~500ms) и cost (~$0.001/request), но существенно повышает precision.

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

### Промежуточные шаги до LLM-extraction

> *Добавлено от Codex: 2025-11-26*

**Этап 1: Стоп-слова + Лемматизация (zero LLM cost)**

```typescript
// Стоп-слова
const STOP_WORDS = new Set([
  'what', 'how', 'why', 'when', 'where', 'who',
  'is', 'are', 'was', 'were', 'be', 'been',
  'the', 'a', 'an', 'this', 'that',
  'should', 'could', 'would', 'can', 'will',
  'i', 'my', 'me', 'you', 'your'
]);

// Простая лемматизация (rules-based)
const LEMMA_RULES: Record<string, string> = {
  'programming': 'program',
  'languages': 'language',
  'learning': 'learn',
  'coding': 'code',
  // ... extend as needed
};

function extractKeywords(query: string): string[] {
  return query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word))
    .map(word => LEMMA_RULES[word] || word);
}
```

**Этап 2: Query Expansion (synonym mapping)**

```typescript
const SYNONYMS: Record<string, string[]> = {
  'programming': ['coding', 'development', 'software'],
  'language': ['lang', 'technology', 'framework'],
  'favorite': ['preferred', 'best', 'like'],
  'learn': ['study', 'education', 'training'],
};

function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set(keywords);
  for (const kw of keywords) {
    if (SYNONYMS[kw]) {
      SYNONYMS[kw].forEach(syn => expanded.add(syn));
    }
  }
  return Array.from(expanded);
}
```

**Этап 3: LLM-based extraction (highest quality)**

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

### Контролируемый словарь и нормализация тегов

> *Добавлено от Codex: 2025-11-26*

**Проблема:** Свободное генерирование тегов приводит к разбросу:
- "python", "Python", "python-language", "python-programming" → один и тот же концепт

**Решение: Tag Taxonomy + Normalization**

```typescript
// Контролируемый словарь категорий
const TAG_TAXONOMY = {
  // Technologies
  languages: ['python', 'javascript', 'typescript', 'go', 'rust', 'java'],
  frameworks: ['react', 'vue', 'express', 'django', 'fastapi'],
  tools: ['git', 'docker', 'kubernetes', 'vscode'],

  // User attributes
  preferences: ['favorite', 'preferred', 'dislike', 'avoid'],
  sentiments: ['positive', 'negative', 'neutral', 'excited'],

  // Action types
  actions: ['question', 'decision', 'learning', 'recommendation', 'problem'],

  // Domains
  domains: ['career', 'education', 'project', 'hobby', 'work'],
};

// Нормализация (synonyms → canonical)
const TAG_NORMALIZATION: Record<string, string> = {
  'python-language': 'python',
  'python-programming': 'python',
  'js': 'javascript',
  'typescript': 'typescript',  // keep as-is
  'fav': 'favorite',
  'fave': 'favorite',
  'favourite': 'favorite',
  'likes': 'favorite',
  'prefers': 'preferred',
};

function normalizeTags(rawTags: string[]): string[] {
  return rawTags
    .map(tag => tag.toLowerCase().trim())
    .map(tag => TAG_NORMALIZATION[tag] || tag)
    .filter(tag => isValidTag(tag));  // Validate against taxonomy
}
```

**Two-pass Tagging Pipeline:**
```
Pass 1: LLM extracts raw tags → ["Python programming", "user likes", "career question"]
Pass 2: Normalize → ["python", "favorite", "career", "question"]
Pass 3: Validate against taxonomy → keep valid, flag unknown for review
```

**Преимущества:**
- Снижение разброса (меньше вариаций одного концепта)
- Лучший tag overlap при retrieval
- Возможность анализа tag distribution

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

### Два варианта для A/B тестирования

> *Добавлено от Codex: 2025-11-26*

**Вариант A: STRICT (no-invent)**
```
You are an AI assistant. You have access to context from previous conversations with this user.

CRITICAL RULES:
1. Use ONLY the context provided below. Do not invent or assume any facts.
2. If the context does not contain relevant information, say:
   "I don't have information about that in our conversation history."
3. NEVER make up details about the user (preferences, history, personal info).
4. Clearly separate: facts from context vs general knowledge.

Context:
{context}

User Query: {query}
```

**Вариант B: RICH STYLE (personalized)**
```
You are a helpful AI assistant who remembers previous conversations with the user.
You have a warm, friendly tone and try to make connections to past discussions.

When using context:
- Reference specific details naturally: "As you mentioned before..."
- Build on previous conversations
- If no relevant history exists, respond helpfully without pretending to remember

Context from previous conversations:
{context}

User: {query}
```

**A/B Test Metrics:**

| Метрика | Strict | Rich | Winner |
|---------|--------|------|--------|
| Hallucination Rate | Lower expected | Higher expected | Strict |
| User Satisfaction | Lower expected | Higher expected | Rich |
| Context Utilization | Similar | Similar | Tie |

**Гипотеза:** Strict лучше для accuracy, Rich лучше для engagement. Оптимум — Strict с элементами Rich при наличии контекста.

### Версионирование в system_prompts

```sql
-- Хранение версий промптов
INSERT INTO system_prompts (role, prompt_text, version, is_active)
VALUES
  ('responder', 'Strict prompt text...', 1, false),
  ('responder', 'Rich prompt text...', 2, true);

-- Получение активного промпта
SELECT prompt_text FROM system_prompts
WHERE role = 'responder' AND is_active = true;
```

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

### Адаптивный выбор модели по сложности запроса

> *Добавлено от Codex: 2025-11-26*

**Идея:** Классифицировать запрос по сложности и выбирать модель соответственно.

```typescript
type QueryComplexity = 'simple' | 'medium' | 'complex';

interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

const MODEL_BY_COMPLEXITY: Record<QueryComplexity, ModelConfig> = {
  simple: {
    model: 'gpt-4o-mini',
    maxTokens: 500,
    temperature: 0.5,
  },
  medium: {
    model: 'gpt-4o-mini',
    maxTokens: 1000,
    temperature: 0.7,
  },
  complex: {
    model: 'gpt-4o',
    maxTokens: 2000,
    temperature: 0.7,
  },
};

// Классификатор сложности (cheap, fast)
async function classifyComplexity(query: string, contextSize: number): Promise<QueryComplexity> {
  // Эвристики без LLM call:
  const wordCount = query.split(/\s+/).length;
  const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1;
  const hasReasoningKeywords = /why|how|explain|compare|analyze/i.test(query);

  if (wordCount < 10 && !hasReasoningKeywords && contextSize < 3) {
    return 'simple';
  }
  if (hasMultipleQuestions || hasReasoningKeywords || contextSize > 5) {
    return 'complex';
  }
  return 'medium';
}

// Или через LLM (more accurate, but adds latency + cost)
async function classifyComplexityLLM(query: string): Promise<QueryComplexity> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Classify this query complexity: "${query}"
      Reply with one word: simple, medium, or complex`
    }]
  });
  return response.choices[0].message.content as QueryComplexity;
}
```

**Cost/Quality Trade-off:**

| Стратегия | Avg Cost | Quality | Latency |
|-----------|----------|---------|---------|
| Always mini | $0.0002 | Good | Fast |
| Always 4o | $0.003 | Excellent | Slow |
| Adaptive (heuristic) | $0.0008 | Very Good | Fast |
| Adaptive (LLM classify) | $0.001 | Very Good | +100ms |

**Рекомендация:** Начать с heuristic-based classification, измерить quality delta, потом решить нужен ли LLM classifier.

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

### Политика усечения и Token Budget

> *Добавлено от Codex: 2025-11-26*

**Проблема:** Когда контекст превышает лимит, что отрезать?

**Две стратегии усечения:**

| Стратегия | Описание | Плюсы | Минусы |
|-----------|----------|-------|--------|
| **DROP** | Отбросить наименее релевантные memories целиком | Простая, быстрая | Теряем информацию |
| **SUMMARY** | Сжать memories через LLM summarization | Сохраняем суть | +latency, +cost |

**Token Budget Distribution:**

```typescript
interface TokenBudget {
  total: number;           // 4000 (общий лимит)
  systemPrompt: number;    // ~200 (фиксированный)
  recentLogs: number;      // ~800 (последние сообщения)
  memories: number;        // ~2500 (LSM memories)
  userQuery: number;       // ~200 (текущий запрос)
  buffer: number;          // ~300 (запас)
}

const DEFAULT_BUDGET: TokenBudget = {
  total: 4000,
  systemPrompt: 200,
  recentLogs: 800,
  memories: 2500,
  userQuery: 200,
  buffer: 300,
};

function allocateTokens(
  recentLogsSize: number,
  memoriesSize: number,
  budget: TokenBudget = DEFAULT_BUDGET
): { recentLogs: number; memories: number } {
  const available = budget.total - budget.systemPrompt - budget.userQuery - budget.buffer;

  // Приоритет: recent logs важнее для continuity
  const recentLogsAlloc = Math.min(recentLogsSize, budget.recentLogs);
  const memoriesAlloc = Math.min(memoriesSize, available - recentLogsAlloc);

  return { recentLogs: recentLogsAlloc, memories: memoriesAlloc };
}
```

**Truncation Pipeline:**

```
1. Calculate token budget per category
2. If memories exceed budget:
   a. Sort by relevance score (descending)
   b. Option A (DROP): Take top-N that fit
   c. Option B (SUMMARY): Summarize bottom memories into single block
3. If recent_logs exceed budget:
   a. Keep most recent N messages
   b. Summarize older messages: "Earlier, you discussed: {summary}"
```

**Рекомендация:**
- Начать с DROP (простая реализация)
- Добавить SUMMARY как fallback для complex queries
- Измерять "context completeness" метрику

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
