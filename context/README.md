# MaaS Context Management

**Purpose:** Centralized management of context format for the MaaS memory system

---

## 📁 Directory Structure

```
/context/
├── README.md                  # This file
├── format.md                  # Current context format specification (ACTIVE)
├── backlog.md                 # Evolution roadmap and future enhancements
├── versions/                  # Historical versions (frozen snapshots)
│   └── v0.1-mvp.md           # First version (2025-11-25)
├── examples-mvp/              # Example contexts for current version
│   ├── empty-memory.txt      # New user, no history
│   └── with-memory.txt       # User with memory
└── CONTEXT_TEMPLATE.md        # Full agent template (future v1.0 target)
```

---

## 🎯 Purpose

The context format is a **critical architectural component** that:

1. **Defines what LLM sees** - Structure of information sent to FinalResponder
2. **Drives agent behavior** - Analyzer searches, Assembler builds based on this format
3. **Evolves with system** - As system grows, format becomes more sophisticated
4. **Affects code and prompts** - Changes here ripple through agents and DB schema

**By separating format from code:**
- ✅ Version control for context changes
- ✅ Clear documentation of evolution
- ✅ Easier to reason about system behavior
- ✅ Systematic impact analysis

---

## 📖 How to Use

### For Developers

**When implementing agents:**
1. Read `format.md` to understand current context structure
2. Implement Assembler to match the template
3. Implement Analyzer to retrieve data specified in format
4. Test using `examples-mvp/` files

**When modifying format:**
1. Update `format.md` with new structure
2. Copy old version to `versions/v{X}.md` (freeze it)
3. Add migration notes to `backlog.md`
4. Update affected agents (Analyzer, Assembler)
5. Create new examples showing the change

**When planning new features:**
1. Check `backlog.md` for planned enhancements
2. Add new items with impact analysis
3. Update version number in `format.md`

---

## 🔄 Version History

| Version | Date | Status | Description |
|---------|------|--------|-------------|
| **0.1.0-mvp** | 2025-11-25 | ✅ Active | Minimal viable memory (plain text, summaries + recent conversation) |
| 0.2.0 | TBD | 📋 Planned | Add semantic tags |
| 0.3.0 | TBD | 📋 Planned | Vector search |
| 0.4.0 | TBD | 📋 Planned | User profile section |
| 0.5.0 | TBD | 📋 Planned | Conditional sections |
| 1.0.0 | TBD | 🔮 Future | Full XML-based agent context |

---

## 📝 Current Format (v0.1.0-mvp)

**Template:**
```
SYSTEM ROLE:
{system_role}

PREVIOUS CONTEXT (from long-term memory):
{summary_1}
{summary_2}
{summary_3}

RECENT CONVERSATION:
User: {query}
Assistant: {answer}
...

CURRENT QUERY:
{current_query}

Please respond naturally, referencing past context when relevant.
```

**Token budget:** ~700 tokens
**Format:** Plain text (no markup)
**Sections:** 5 (system role, memory, recent, current, instruction)

See `format.md` for complete specification.

---

## 🧪 Testing

Use example files to test agent implementations:

```bash
# Test with empty memory (new user)
cat examples-mvp/empty-memory.txt

# Test with full context (user with history)
cat examples-mvp/with-memory.txt
```

**Expected behavior:**
- Empty memory → Generic, helpful response
- With memory → Personalized response referencing past context

---

## 🔗 Related Documentation

- `../db/schema.sql` - Database tables that feed context (lsm_storage, raw_logs)
- `../src/agents/index.ts` - Assembler implementation
- `CONTEXT_TEMPLATE.md` - Full agent template (target for v1.0)

---

## ⚠️ Important Notes

1. **Context format is versioned** - Breaking changes require new major version
2. **Always update backlog** - Document why changes were made
3. **Test before deploying** - Context changes affect all responses
4. **Token budget matters** - Stay within limits for cost/performance
5. **Freeze old versions** - Copy to `versions/` before modifying

---

## 📊 Impact Matrix

When changing context format, consider impact on:

| Component | Impact | Action Required |
|-----------|--------|-----------------|
| **Assembler** | 🔴 High | Update context building logic |
| **Analyzer** | 🟡 Medium | May need to retrieve different data |
| **FinalResponder** | 🟢 Low | Just receives new format |
| **Archivist** | 🟡 Medium | May need to extract new fields |
| **Database schema** | 🟡 Medium | May need new columns/tables |
| **System prompts** | 🟡 Medium | Agents may need new instructions |
| **Tests** | 🔴 High | Update test scenarios and expectations |

---

*This directory is the source of truth for context format*
*Last updated: 2025-11-25*
