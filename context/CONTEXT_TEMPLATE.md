# MaaS Context Bundle Template

**Version:** 0.1.0-design
**Created:** 2025-11-22
**Status:** ✅ Complete (Design Phase Step 2)

---

> **Purpose:** This document defines the exact structure of context bundles sent to LLMs.
> - **Technology-agnostic:** Can be implemented in XML, Markdown, or JSON
> - **Token-optimized:** Progressive detailing under 4-8k token budget
> - **Aligned with:** DATABASE_SCHEMA.md entities and query patterns
> - **Based on:** archive/legacy-docs/claude-code-reference.md (reverse-engineered from Claude Code)

> **📖 Document Hierarchy:**
> - ⬆️ **Parent:** [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) (HOW — принципиальная схема)
> - 📄 **This document:** IMPLEMENTATION — формат контекста XML
> - ⬇️ **Siblings:** [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) (схема данных)
>
> **Recommended reading order:** PROJECT_INTAKE.md → ARCHITECTURE.md → SYSTEM_DESIGN.md → **CONTEXT_TEMPLATE.md**

---

## 📋 Template Overview

### Format Choice: **XML**

**Rationale:**
- ✅ **Hierarchical structure:** Clear parent-child relationships (mission > insights > facts)
- ✅ **Metadata support:** Attributes for source, date, importance, level
- ✅ **LLM-friendly:** Models trained on structured markup (XML, HTML)
- ✅ **Human-readable:** Easy to debug and validate
- ✅ **Extensible:** Can add new sections/attributes without breaking structure

**Alternatives Considered:**
- **Markdown:** Simpler, but lacks structured metadata (no attributes)
- **JSON:** Machine-friendly, but less human-readable for LLMs
- **Plain text:** Minimal, but loses structure and priority signals

---

## 🎨 Markup Elements

### Priority Indicators

| Symbol | Meaning | Usage | Impact |
|--------|---------|-------|--------|
| ⭐ | **Critical** (must preserve) | Mission, goals, constraints | Always included, highest priority |
| 🔴 | **High priority** | Important insights, decisions | Prioritized during token budget enforcement |
| 📌 | **Pinned fact** | Always relevant facts | Never dropped, even under budget pressure |

### Attribution Tags (XML Attributes)

```xml
<fact
  id="fact_123"                    <!-- Unique identifier -->
  subject="Task A priority"         <!-- What this fact is about -->
  source="msg_456"                  <!-- Source reference (Episode.id) -->
  date="2025-10-20"                 <!-- When fact was created -->
  level="fact"                      <!-- Knowledge level: fact | hypothesis | interpretation | decision -->
  importance="0.8"                  <!-- Optional: 0.0-1.0 -->
>
  Fact content here...
</fact>
```

**Source Mapping:**
- `source="msg_123"` → EPISODE.id (from dialogue)
- `source="doc_456"` → External document ID
- `source="url_789"` → External URL reference

**Knowledge Levels:**
- `level="fact"` - Verified statement
- `level="hypothesis"` - Unverified assumption
- `level="interpretation"` - AI-derived conclusion
- `level="decision"` - Explicit choice

---

## 🗂️ Template Structure (XML)

### Complete Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<maas_context
  version="1.0"
  project_id="{PROJECT.id}"
  token_budget="8000"
  generated_at="2025-11-22T10:30:00Z"
>

  <!-- =========================================== -->
  <!-- SECTION 1: MICRO-INSTRUCTION (always included) -->
  <!-- =========================================== -->
  <context_reading_guide>
    This context is structured for optimal comprehension.

    **Priority Markers:**
    - ⭐ = Critical (must always consider)
    - 🔴 = High priority insight/decision
    - 📌 = Pinned fact (always relevant to current context)

    **Sections ordered by priority:**
    1. &lt;background_information&gt; - Project mission and goals (ALWAYS consider)
    2. &lt;semantic_memory&gt; - Accumulated wisdom (insights)
    3. &lt;episodic_memory&gt; - Specific facts and recent events
    4. &lt;external_knowledge&gt; - Optional RAG results

    **Source Attribution:**
    - Each fact/insight includes `source` and `date` attributes
    - Knowledge `level` indicates certainty: fact > interpretation > hypothesis

    **How to use this context:**
    - Start with mission and goals (understand "why")
    - Review insights for patterns and learnings
    - Check facts for specific details
    - Cite sources when stating information
  </context_reading_guide>

  <!-- =========================================== -->
  <!-- SECTION 2: BACKGROUND INFORMATION (permanent, always included) -->
  <!-- =========================================== -->
  <background_information priority="critical">
    <mission>⭐ {PROJECT.mission}</mission>
    <goals>
      <goal>{PROJECT.goals[0]}</goal>
      <goal>{PROJECT.goals[1]}</goal>
      <!-- ... -->
    </goals>
    <constraints>
      <constraint>{PROJECT.constraints[0]}</constraint>
      <!-- ... if any -->
    </constraints>
  </background_information>

  <!-- =========================================== -->
  <!-- SECTION 3: SEMANTIC MEMORY (AI-generated insights) -->
  <!-- =========================================== -->
  <semantic_memory retrieved="3" total_insights="10">
    <insights>
      <!-- Retrieved from INSIGHT table via vector search -->
      <!-- Sorted by relevance score (cosine similarity) -->

      <insight
        id="ins_001"
        importance="0.9"
        source_episodes="[ep_101, ep_105, ep_112]"
        extracted_at="2025-11-15T14:20:00Z"
      >
        🔴 User tends to underestimate task complexity, leading to missed deadlines
      </insight>

      <insight
        id="ins_002"
        importance="0.85"
        source_episodes="[ep_120, ep_125]"
        extracted_at="2025-11-18T09:30:00Z"
      >
        🔴 Client shifts priorities under investor pressure; maintain flexible roadmap
      </insight>

      <insight
        id="ins_003"
        importance="0.7"
        source_episodes="[ep_90, ep_95, ep_100]"
        extracted_at="2025-11-10T16:45:00Z"
      >
        Team works best with iterative approach; avoid big-bang releases
      </insight>
    </insights>
  </semantic_memory>

  <!-- =========================================== -->
  <!-- SECTION 4: EPISODIC MEMORY (events and facts) -->
  <!-- =========================================== -->
  <episodic_memory>

    <!-- 4A: RECENT MESSAGES (working memory) -->
    <recent_messages count="5" session_id="sess_abc123">
      <!-- Retrieved from EPISODE table: last 5-10 messages -->
      <!-- ORDER BY created_at DESC LIMIT 10 -->

      <message role="user" timestamp="2025-11-22T10:25:00Z">
        I'm thinking we should drop Task A to focus on the core features.
      </message>

      <message role="assistant" timestamp="2025-11-22T10:26:00Z">
        Let's discuss the implications. Task A was previously marked as critical for Q4 goals.
        Can you share what changed?
      </message>

      <message role="user" timestamp="2025-11-22T10:27:00Z">
        The investor meeting shifted priorities. They want MVP faster, even if incomplete.
      </message>

      <!-- ... additional messages ... -->
    </recent_messages>

    <!-- 4B: RELEVANT FACTS (retrieved via vector search) -->
    <relevant_facts retrieved="5" total_facts="50">
      <!-- Retrieved from FACT table via vector search -->
      <!-- Filtered by project_id, level IN ['fact', 'decision'] -->
      <!-- ORDER BY cosine_similarity DESC LIMIT 5 -->

      <fact
        id="fact_123"
        subject="Task A criticality"
        source="msg_456"
        date="2025-10-20"
        level="decision"
      >
        📌 Task A was deemed critical for achieving Q4 revenue goal ($500k target)
      </fact>

      <fact
        id="fact_124"
        subject="MVP scope"
        source="msg_480"
        date="2025-11-01"
        level="fact"
      >
        MVP must include: user auth, payment integration, basic dashboard
      </fact>

      <fact
        id="fact_125"
        subject="Team capacity"
        source="msg_490"
        date="2025-11-05"
        level="fact"
      >
        Team can deliver ~10 story points per week; Q4 deadline leaves 6 weeks
      </fact>

      <fact
        id="fact_130"
        subject="Investor expectations"
        source="msg_500"
        date="2025-11-12"
        level="interpretation"
      >
        Investors prioritize speed over completeness; willing to accept technical debt
      </fact>

      <fact
        id="fact_135"
        subject="Task A dependencies"
        source="msg_510"
        date="2025-11-15"
        level="fact"
      >
        Task A blocks: payment integration, revenue tracking dashboard
      </fact>
    </relevant_facts>

  </episodic_memory>

  <!-- =========================================== -->
  <!-- SECTION 5: EXTERNAL KNOWLEDGE (optional, RAG results) -->
  <!-- =========================================== -->
  <external_knowledge retrieved="2" source="rag">
    <!-- Optional: Retrieved from external documents/URLs -->
    <!-- Only included if token budget allows -->

    <chunk
      source="doc_product_spec_v2.pdf"
      relevance="0.89"
      page="12"
    >
      Q4 Revenue Goal: The product must generate $500k ARR by Dec 31.
      Critical features: payments, user onboarding, analytics dashboard.
    </chunk>

    <chunk
      source="url_https://example.com/mvp-guide"
      relevance="0.75"
    >
      MVP Best Practices: Focus on core value proposition.
      Cut nice-to-have features. Ship fast, iterate based on feedback.
    </chunk>
  </external_knowledge>

  <!-- =========================================== -->
  <!-- METADATA (observability) -->
  <!-- =========================================== -->
  <metadata>
    <token_usage>
      <micro_instruction>150</micro_instruction>
      <background_information>220</background_information>
      <semantic_memory>380</semantic_memory>
      <episodic_memory>
        <recent_messages>650</recent_messages>
        <relevant_facts>580</relevant_facts>
      </episodic_memory>
      <external_knowledge>320</external_knowledge>
      <total>2300</total>
    </token_usage>
    <retrieval_stats>
      <insights_total>10</insights_total>
      <insights_retrieved>3</insights_retrieved>
      <facts_total>50</facts_total>
      <facts_retrieved>5</facts_retrieved>
      <rag_chunks_retrieved>2</rag_chunks_retrieved>
    </retrieval_stats>
  </metadata>

</maas_context>
```

---

## 📊 Token Budget Distribution

### Budget: 4,000 - 8,000 tokens

**Tier 1: ANCHORS (always included, ~20-25% of budget)**
```
Micro-instruction:           ~150 tokens  ( 2%)
Background (mission/goals):  ~220 tokens  ( 3%)
Recent messages (5-10):      ~650 tokens  ( 8%)
---
Subtotal:                   ~1020 tokens  (13%)
```

**Tier 2: CORE MEMORY (high priority, ~40-50% of budget)**
```
Semantic memory (3 insights):  ~380 tokens  ( 5%)
Episodic memory (5 facts):     ~580 tokens  ( 7%)
---
Subtotal:                      ~960 tokens  (12%)
```

**Tier 3: SUPPLEMENTARY (if budget allows, ~20-30% of budget)**
```
External knowledge (RAG):     ~320 tokens  ( 4%)
Additional facts:             ~500 tokens  ( 6%)
---
Subtotal:                     ~820 tokens  (10%)
```

**Total Example:**
```
Anchors:        1020 tokens  (36%)
Core memory:     960 tokens  (34%)
Supplementary:   820 tokens  (29%)
---
Total:          2800 tokens  (35% of 8k budget)
```

**Progressive Detailing:**
```
IF token_budget >= 8000:
  Include: All tiers + additional facts/insights

IF token_budget >= 6000:
  Include: Tiers 1 + 2 + partial RAG

IF token_budget >= 4000:
  Include: Tiers 1 + 2 only

IF token_budget < 4000:
  Include: Tier 1 + top 3 insights + top 3 facts
```

---

## 🎯 Success Criteria

This template is considered complete when:

- ✅ Format chosen (XML) with clear rationale
- ✅ All sections defined (micro-instruction, background, semantic, episodic, RAG)
- ✅ Markup elements specified (⭐, 🔴, 📌) with usage rules
- ✅ Attribution tags documented (source, date, level, importance)
- ✅ Token budget distribution defined
- ✅ Progressive detailing strategy specified
- ✅ Complete XML template provided
- ✅ Aligned with DATABASE_SCHEMA.md entities

---

## 📚 References

- **DATABASE_SCHEMA.md** - Entity definitions (PROJECT, FACT, INSIGHT, EPISODE)
- **CONTEXT_STRUCTURE_TEMPLATE.md** - Reverse-engineered from Claude Code
- **ARCHITECTURE.md** - Conceptual architecture (BuildSnapshot process)
- **BACKLOG.md** - Design phase checklist (Step 2)

---

*This template defines the structure of context bundles for MaaS*
*Deliverable for Design Phase Step 2*
*Last updated: 2025-11-22*
