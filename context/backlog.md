# MaaS Context Format Backlog

**Purpose:** Track the evolution of context format as the system grows
**Current version:** 0.1.0-mvp
**Last updated:** 2025-11-25

---

## 🎯 Vision

The context format will evolve from simple memory (v0.1) to a sophisticated, multi-layered context system supporting specialized agents (v1.0+).

**Evolution path:**
```
v0.1 (MVP)        - Basic memory (summaries + recent conversation)
    ↓
v0.2              - + Semantic tags (keyword extraction)
    ↓
v0.3              - + Vector search (semantic similarity)
    ↓
v0.4              - + User profile (preferences, patterns)
    ↓
v0.5              - + Conditional sections (query-type dependent)
    ↓
v1.0 (Full Agent) - + XML format, priorities, token budget, source attribution
```

---

## 📋 Backlog Items

### ✅ v0.1.0-mvp (CURRENT)
**Status:** In Development
**Target:** 2025-11-25
**Description:** Minimal viable memory system

**Features:**
- ✅ Plain text format
- ✅ System role
- ✅ Previous context (2-3 summaries from lsm_storage)
- ✅ Recent conversation (2-3 exchanges from raw_logs)
- ✅ Current query
- ✅ ~700 token budget

**Implementation:**
- Assembler builds simple text template
- Analyzer uses keyword search
- Archivist creates plain summaries

---

### 🔄 v0.2.0 - Semantic Tags
**Status:** Planned
**Target:** After v0.1 is tested
**Description:** Add semantic tags to improve retrieval

**Changes to format:**
```diff
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory.

PREVIOUS CONTEXT (from long-term memory):
+ [Topics: vacation, japan, budget-travel, cherry-blossoms]
User discussed vacation planning to Japan. Interested in cherry blossoms...

CURRENT QUERY:
What are the best months to visit Japan?
```

**Database changes:**
```sql
ALTER TABLE lsm_storage
ADD COLUMN semantic_tags TEXT[] DEFAULT '{}';
```

**Code changes:**
- Archivist: Extract tags using OpenAI
- Analyzer: Use tags for better matching
- Assembler: Display tags (optional)

**Benefits:**
- Better retrieval accuracy
- Faster search (GIN index on tags)
- Clear topic visibility

---

### 🔮 v0.3.0 - Vector Search
**Status:** Future
**Target:** TBD
**Description:** Replace keyword search with semantic vector search

**Database changes:**
```sql
-- Enable pgvector extension
CREATE EXTENSION vector;

ALTER TABLE lsm_storage
ADD COLUMN embedding VECTOR(1536);

-- Create HNSW index for fast search
CREATE INDEX ON lsm_storage USING hnsw (embedding vector_cosine_ops);
```

**Code changes:**
- Archivist: Generate embeddings via OpenAI
- Analyzer: Compute query embedding, search by cosine similarity
- No format changes (retrieval logic only)

**Benefits:**
- Semantic matching (not just keywords)
- Handles synonyms, paraphrasing
- More relevant context

---

### 🔮 v0.4.0 - User Profile Section
**Status:** Future
**Target:** TBD
**Description:** Add persistent user profile to context

**Changes to format:**
```diff
SYSTEM ROLE:
You are a helpful AI assistant with long-term memory.

+ USER PROFILE:
+ - Name: Alex
+ - Preferences: Budget travel, cultural experiences
+ - Constraints: $3000-5000 budget, 2-week trips
+ - Interests: Japan, cherry blossoms, temples

PREVIOUS CONTEXT (from long-term memory):
...
```

**Database changes:**
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY,
  name TEXT,
  preferences JSONB,
  constraints JSONB,
  interests TEXT[],
  updated_at TIMESTAMP
);
```

**Code changes:**
- Archivist: Extract profile facts from conversations
- Assembler: Include profile section if exists

**Benefits:**
- Personalized responses
- Remember long-term preferences
- Reduce repetition

---

### 🔮 v0.5.0 - Conditional Sections
**Status:** Future
**Target:** TBD
**Description:** Include different sections based on query type

**Logic:**
```typescript
if (queryType === 'factual') {
  // Skip recent conversation, focus on knowledge
  context = systemRole + previousContext + currentQuery;
}

if (queryType === 'follow-up') {
  // Include recent conversation, skip old memories
  context = systemRole + recentConversation + currentQuery;
}

if (queryType === 'planning') {
  // Include everything
  context = systemRole + userProfile + previousContext + recentConversation + currentQuery;
}
```

**Code changes:**
- Analyzer: Classify query type
- Assembler: Build conditional context

**Benefits:**
- Optimize token usage
- Relevant context only
- Faster responses

---

### 🔮 v1.0.0 - Full Agent Context
**Status:** Future (Long-term)
**Target:** TBD
**Description:** Migrate to full XML-based template (from `CONTEXT_TEMPLATE.md`)

**Changes to format:**
- Switch from plain text to XML
- Add priority markers (⭐, 🔴, 📌)
- Add source attribution
- Add knowledge levels (fact/hypothesis/interpretation)
- Add token budget management
- Add multiple memory types (insights, facts, episodes)

**Database changes:**
- Split `lsm_storage` into `insights` + `facts` tables
- Add `projects` table (mission, goals, constraints)
- Add `episodes` table (individual messages)

**Benefits:**
- Support specialized agents
- Fine-grained memory control
- Production-ready architecture

---

## 🔄 Change Impact Matrix

| Version | Format Changes | DB Changes | Code Changes | Backward Compatible |
|---------|---------------|------------|--------------|---------------------|
| v0.1 → v0.2 | +Tags display | +semantic_tags column | Archivist, Assembler | ✅ Yes |
| v0.2 → v0.3 | None | +embedding column | Analyzer only | ✅ Yes |
| v0.3 → v0.4 | +User profile section | +user_profiles table | Archivist, Assembler | ✅ Yes |
| v0.4 → v0.5 | Conditional logic | None | Analyzer, Assembler | ✅ Yes |
| v0.5 → v1.0 | Plain text → XML | Major restructure | All agents | ❌ Breaking |

---

## 📊 Decision Log

### Why plain text for v0.1?
**Decision:** Use plain text instead of XML
**Reasoning:**
- ✅ Simpler to implement
- ✅ Fewer tokens (no markup overhead)
- ✅ Easier to debug
- ✅ Sufficient for MVP

**Trade-offs:**
- ⚠️ Less structured (harder to parse)
- ⚠️ No metadata (source, date, importance)
- ⚠️ Migration needed for v1.0

**Revisit:** When moving to v1.0 (specialized agents)

---

### Why 2-3 summaries max?
**Decision:** Limit to 2-3 most relevant summaries
**Reasoning:**
- ✅ Keeps token budget low (~300 tokens)
- ✅ Prevents information overload
- ✅ Forces better retrieval (quality over quantity)

**Trade-offs:**
- ⚠️ Might miss relevant context
- ⚠️ Relies on good retrieval

**Metrics to track:**
- User feedback on "did the AI remember?"
- Retrieval accuracy (precision/recall)

**Revisit:** If users report memory gaps

---

## 🧪 Testing Strategy

### Per-version testing

**v0.1:**
- [ ] New user (no memory) → expects generic response
- [ ] User with memory → expects personalized response
- [ ] Multi-turn conversation → remembers earlier turns

**v0.2:**
- [ ] Tag extraction accuracy
- [ ] Tag-based retrieval precision
- [ ] Tag display clarity

**v0.3:**
- [ ] Vector search vs keyword search comparison
- [ ] Semantic similarity correctness
- [ ] Performance (query time)

**v0.4:**
- [ ] Profile extraction accuracy
- [ ] Profile usage in responses
- [ ] Profile update frequency

---

## 📚 References

- `format.md` - Current format specification
- `CONTEXT_TEMPLATE.md` - Full agent template (v1.0 target)
- `../src/agents/index.ts` - Assembler implementation
- `../db/schema.sql` - Database schema

---

*This backlog guides the evolution of context format*
*Last updated: 2025-11-25*
