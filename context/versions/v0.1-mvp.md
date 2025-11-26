# MaaS Context Format Specification

**Version:** 0.1.0-mvp
**Created:** 2025-11-25
**Status:** Active
**Purpose:** Define the exact structure of context sent to LLM (FinalResponder)

---

## 🎯 Design Principles

1. **Minimalism** - Only what's needed for memory to work
2. **Plain text** - No XML/JSON overhead (optimize for tokens)
3. **Extensible** - Can add sections without breaking existing code
4. **General pattern** - Works for any assistant, not specific agent

---

## 📋 Context Structure (v0.1.0)

### Template

```
SYSTEM ROLE:
{system_role_text}

PREVIOUS CONTEXT (from long-term memory):
{summary_1}

{summary_2}

{summary_3}

RECENT CONVERSATION:
User: {recent_query_1}
Assistant: {recent_answer_1}

User: {recent_query_2}
Assistant: {recent_answer_2}

CURRENT QUERY:
{current_user_query}

Please respond naturally, referencing past context when relevant.
```

---

## 🔧 Section Definitions

### 1. SYSTEM ROLE
- **Source:** Hardcoded or from `system_prompts` table
- **Required:** Always included
- **Max tokens:** ~50 tokens
- **Example:**
  ```
  You are a helpful AI assistant with long-term memory of past conversations with this user.
  ```

### 2. PREVIOUS CONTEXT (from long-term memory)
- **Source:** `lsm_storage` table (retrieved by Analyzer)
- **Required:** Optional (only if relevant memories exist)
- **Count:** 2-3 most relevant summaries
- **Max tokens:** ~300 tokens
- **Retrieval:** Keyword search (v0.1), vector search (future)
- **Format:** Plain text, one summary per paragraph
- **Example:**
  ```
  User discussed vacation planning to Japan. Interested in cherry blossoms, budget travel, April-May timeframe.

  User mentioned budget constraint of $3000-5000 for 2-week trip. Prefers cultural experiences over luxury hotels.
  ```

### 3. RECENT CONVERSATION
- **Source:** `raw_logs` table (last 2-3 exchanges)
- **Required:** Optional (only if conversation exists)
- **Count:** 2-3 most recent user-assistant exchanges
- **Max tokens:** ~200 tokens
- **Order:** Chronological (oldest to newest)
- **Format:**
  ```
  User: {query}
  Assistant: {answer}
  ```

### 4. CURRENT QUERY
- **Source:** `pipeline_runs.user_query`
- **Required:** Always included
- **Max tokens:** ~100 tokens
- **Example:**
  ```
  What are the best months to visit Japan?
  ```

### 5. INSTRUCTION
- **Source:** Hardcoded
- **Required:** Always included
- **Max tokens:** ~20 tokens
- **Text:**
  ```
  Please respond naturally, referencing past context when relevant.
  ```

---

## 📊 Token Budget

**Total budget:** ~700 tokens (conservative for gpt-4o-mini)

| Section | Tokens | Required |
|---------|--------|----------|
| System role | ~50 | ✅ |
| Previous context (3 summaries) | ~300 | Optional |
| Recent conversation (2-3 exchanges) | ~200 | Optional |
| Current query | ~100 | ✅ |
| Instruction | ~20 | ✅ |
| **Total** | **~670** | - |

**Progressive detail strategy:**
```
IF no memory exists:
  Include: System role + Current query + Instruction (~170 tokens)

IF memory exists, no recent conversation:
  Include: System role + Previous context + Current query + Instruction (~470 tokens)

IF memory + recent conversation exist:
  Include: All sections (~670 tokens)
```

---

## 🔄 Assembly Logic

**Implemented in:** `src/agents/index.ts` → `runAssembler()`

**Algorithm:**
```typescript
1. Get analysis results (from Analyzer)
   - analysis.memories[] - relevant summaries from LSM

2. Get recent conversation (from raw_logs)
   - Last 2-3 user-assistant exchanges

3. Build context string:
   a. Add SYSTEM ROLE (always)
   b. IF memories exist: Add PREVIOUS CONTEXT section
   c. IF recent logs exist: Add RECENT CONVERSATION section
   d. Add CURRENT QUERY (always)
   e. Add INSTRUCTION (always)

4. Save to pipeline_runs.final_context_payload
```

---

## 📝 Example Contexts

### Example 1: New User (No Memory)

```
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory of past conversations with this user.

CURRENT QUERY:
I need help planning a vacation to Japan

Please respond naturally, referencing past context when relevant.
```

**Token usage:** ~170 tokens

---

### Example 2: With Memory, No Recent Conversation

```
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory of past conversations with this user.

PREVIOUS CONTEXT (from long-term memory):
User discussed vacation planning to Japan. Interested in cherry blossoms, budget travel, April-May timeframe.

User mentioned budget constraint of $3000-5000 for 2-week trip. Prefers cultural experiences over luxury hotels.

CURRENT QUERY:
What are the best months to visit Japan?

Please respond naturally, referencing past context when relevant.
```

**Token usage:** ~470 tokens

---

### Example 3: With Memory + Recent Conversation (Full Context)

```
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory of past conversations with this user.

PREVIOUS CONTEXT (from long-term memory):
User discussed vacation planning to Japan. Interested in cherry blossoms, budget travel, April-May timeframe.

User mentioned budget constraint of $3000-5000 for 2-week trip. Prefers cultural experiences over luxury hotels.

RECENT CONVERSATION:
User: I need help planning a vacation to Japan
Assistant: I'd be happy to help! Based on our previous discussions, I know you're interested in visiting during cherry blossom season with a budget of $3000-5000. Let me provide some recommendations.

CURRENT QUERY:
What are the best months to visit Japan?

Please respond naturally, referencing past context when relevant.
```

**Token usage:** ~670 tokens

---

## 🎯 Success Criteria

This format is considered complete when:

- ✅ Plain text structure defined (no XML/JSON)
- ✅ All sections specified with token budgets
- ✅ Source tables mapped (lsm_storage, raw_logs, pipeline_runs)
- ✅ Assembly algorithm documented
- ✅ Progressive detail strategy defined
- ✅ Examples provided for all scenarios
- ✅ Aligned with existing database schema

---

## 🔮 Future Enhancements (Backlog)

See `backlog.md` for planned improvements:
- v0.2: Add semantic tags to summaries
- v0.3: Vector-based retrieval
- v0.4: User profile section
- v0.5: Conditional sections based on query type

---

## 📚 Related Files

- `backlog.md` - Evolution roadmap
- `versions/v0.1-mvp.md` - This version (frozen)
- `examples/` - Real context examples
- `../src/agents/index.ts` - Assembler implementation

---

*Last updated: 2025-11-25*
*Author: MaaS MVP Team*
