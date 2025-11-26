# Golden Dataset & LLM-Judge

> Чем тестировать качество системы.

---

## Golden Dataset

### Артефакт данных

- **Таблица:** `test_dialogs`
- **Поля:** `id`, `user_query`, `expected_memory_ids UUID[]`, `category`, `difficulty`

### Артефакт логики

- **Модуль:** `[NEW] src/test-runner/evaluator.ts`
- **Функция:** `evaluateOnGoldenDataset()` — прогоняет все тесты, считает recall

---

## Структура тестового примера

```typescript
interface GoldenExample {
  id: string;

  // Input
  user_query: string;
  user_context?: {
    previous_queries?: string[];
    known_facts?: string[];
  };

  // Expected Output
  expected: {
    should_retrieve: boolean;           // Нужен ли контекст?
    relevant_memory_ids?: string[];     // Какие memories релевантны
    key_facts_in_response?: string[];   // Что должно быть в ответе
    forbidden_in_response?: string[];   // Чего НЕ должно быть
  };

  // Metadata
  category: 'factual' | 'preference' | 'temporal' | 'multi-hop';
  difficulty: 'easy' | 'medium' | 'hard';
}
```

---

## Категории тестов

| Категория | Описание | Примеры запросов |
|-----------|----------|------------------|
| **Factual Recall** | Помнит ли система факты | "What's my favorite language?", "Where do I work?" |
| **Preference Inference** | Выводит ли предпочтения | "What movies would I like?", "Tabs or spaces?" |
| **Temporal Reasoning** | Понимает ли время | "What did we discuss yesterday?" |
| **Multi-hop** | Связывает ли факты | "Based on my work and interests, what conferences?" |
| **Negative Cases** | Когда НЕ использовать память | "What is 2+2?", "Tell me about quantum physics" |

---

## LLM-Judge

### Артефакты

| Артефакт | Тип | Статус |
|----------|-----|--------|
| `[NEW] prompts/llm_judge.md` | Файл промптов | Планируется |
| `[NEW] src/utils/llmJudge.ts` | Модуль | Планируется |

### Функции в модуле

| Функция | Что оценивает | Результат |
|---------|---------------|-----------|
| `judgeRetrievalRelevance(query, memories)` | Релевантность поднятых memories | `{relevant: boolean, precision: number}` |
| `judgeContextUtilization(context, query, response)` | Использовал ли LLM контекст | `{utilized: boolean, evidence: string}` |
| `detectHallucination(context, response)` | Есть ли выдумки в ответе | `{detected: boolean, claims: string[]}` |

---

## Промпты для LLM-Judge

### 1. Retrieval Relevance Judge

```
You are evaluating whether retrieved memories are relevant to a user query.

User Query: {query}

Retrieved Memories:
{memories}

For each memory, answer:
1. Is this memory relevant to the query? (yes/no)
2. Confidence (high/medium/low)

Then provide overall:
- Precision: X out of Y memories were relevant
- Any memories that seem completely off-topic?

Respond in JSON:
{
  "per_memory": [{"id": "...", "relevant": true/false, "confidence": "..."}],
  "precision": 0.XX,
  "notes": "..."
}
```

### 2. Context Utilization Judge

```
You are evaluating whether an AI response actually used the provided context.

Context Provided:
{context}

User Query: {query}

AI Response: {response}

Evaluate:
1. Did the response reference information from the context? (yes/partial/no)
2. Could the response have been generated without the context? (yes/no)
3. Did the response contradict the context? (yes/no)

Respond in JSON:
{
  "context_used": "yes" | "partial" | "no",
  "could_answer_without_context": true/false,
  "contradicts_context": true/false,
  "evidence": "quote from response that shows context usage or lack thereof"
}
```

### 3. Hallucination Detection Judge

```
You are checking if an AI response contains hallucinated information.

Known Facts (from memory/context):
{known_facts}

User Query: {query}

AI Response: {response}

Check:
1. Does the response claim facts not present in Known Facts?
2. Does the response contradict Known Facts?
3. Does the response make up specific details (names, dates, numbers)?

Respond in JSON:
{
  "hallucination_detected": true/false,
  "hallucinated_claims": ["claim 1", "claim 2"],
  "contradictions": ["contradiction 1"],
  "severity": "none" | "minor" | "major"
}
```

---

## Команды для агента

1. «Добавь поля `expected_memory_ids UUID[]`, `category VARCHAR(20)`, `difficulty VARCHAR(10)` в таблицу `test_dialogs`.»
2. «Наполни `test_dialogs` тестовыми примерами по категориям выше (минимум 50 примеров).»
3. «Создай файл `prompts/llm_judge.md` с тремя промптами выше.»
4. «Создай `src/utils/llmJudge.ts` с функциями из таблицы, которые читают промпты и вызывают OpenAI.»
5. «Реализуй `evaluateOnGoldenDataset()` в `src/test-runner/evaluator.ts`.»

---

*См. также: [METRICS.md](../../METRICS.md) — формулы для вычисления precision, recall*
