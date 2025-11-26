-- MaaS MVP Seeds
-- Initial data for system_prompts and test scenarios

-- ============================================================
-- SYSTEM PROMPTS (Stub versions for MVP)
-- These will be replaced with real prompts in later phases
-- ============================================================

-- Analyzer: Determines search intent and extracts parameters
INSERT INTO system_prompts (role_name, prompt_template, model_name, temperature, max_tokens, is_active) VALUES
('analyzer',
'You are a query analyzer. Your task is to analyze the user query and determine:
1. Intent: Is this a SPECIFIC_SEARCH (looking for past information) or GENERAL_CHAT (general question)?
2. If SPECIFIC_SEARCH, extract:
   - time_range: relative time period (e.g., "last week", "yesterday", "2 months ago")
   - keywords: important terms to search for
   - entities: names, places, concepts mentioned

User query: {{USER_QUERY}}

Respond ONLY with valid JSON in this format:
{
  "intent": "SPECIFIC_SEARCH" | "GENERAL_CHAT",
  "search_params": {
    "time_range": "...",
    "keywords": ["..."],
    "entities": ["..."]
  }
}',
'gpt-4o-mini',
0.3,  -- Low temperature for consistent output
500,
true
);

-- Assembler: Builds context from LSM and current query
INSERT INTO system_prompts (role_name, prompt_template, model_name, temperature, max_tokens, is_active) VALUES
('assembler',
'You are a context assembler. Your task is to combine:
1. User query: {{USER_QUERY}}
2. Analysis result: {{ANALYSIS_RESULT}}
3. Retrieved memories: {{LSM_RESULTS}}

Create a comprehensive context document that includes:
- Summary of what the user is asking
- Relevant information from past conversations
- Key facts and details needed to answer

Format the output as a clear, structured context that the final model can use.

Context:',
'gpt-4o-mini',
0.5,
2000,
true
);

-- Final Responder: Generates the final answer
INSERT INTO system_prompts (role_name, prompt_template, model_name, temperature, max_tokens, is_active) VALUES
('final_responder',
'You are an AI expert assistant with access to long-term memory of past conversations.

Context from memory:
{{CONTEXT}}

User query:
{{USER_QUERY}}

Provide a comprehensive, helpful answer that:
1. Directly addresses the user''s question
2. References relevant information from the context
3. Is clear, concise, and well-structured

Answer:',
'gpt-4o',  -- Use better model for final response
0.7,
3000,
true
);

-- Archivist: Processes logs into LSM summaries (background job)
INSERT INTO system_prompts (role_name, prompt_template, model_name, temperature, max_tokens, is_active) VALUES
('archivist',
'You are a memory archivist. Your task is to process conversation logs and create compressed summaries.

Conversation logs:
{{RAW_LOGS}}

Create a summary that:
1. Captures key topics discussed
2. Preserves important facts and decisions
3. Identifies main themes and entities
4. Is concise but comprehensive

Also extract:
- semantic_tags: array of 3-7 keywords representing topics
- time_bucket: the week period (format: YYYY-Www, e.g., "2025-W42")

Respond ONLY with valid JSON:
{
  "summary_text": "...",
  "semantic_tags": ["tag1", "tag2", "tag3"],
  "time_bucket": "YYYY-Www"
}',
'gpt-4o-mini',
0.5,
2000,
true
);

-- ============================================================
-- TEST SCENARIOS
-- Pre-defined test dialogs for Test Runner
-- ============================================================

-- Scenario 1: Simple question (GENERAL_CHAT)
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword, metadata) VALUES
('00000000-0000-0000-0000-000000000001', 1, 'What is the capital of France?', 'Paris', '{"type": "general_knowledge"}'::jsonb),
('00000000-0000-0000-0000-000000000001', 2, 'Tell me more about Paris', 'France', '{"type": "follow_up"}'::jsonb);

-- Scenario 2: Memory-based question (SPECIFIC_SEARCH)
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword, metadata) VALUES
('00000000-0000-0000-0000-000000000002', 1, 'I discussed project Alpha with you last week. Can you remind me what we decided?', 'Alpha', '{"type": "memory_recall"}'::jsonb),
('00000000-0000-0000-0000-000000000002', 2, 'What were the main action items from that discussion?', 'action', '{"type": "memory_search"}'::jsonb);

-- Scenario 3: Multi-turn conversation
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword, metadata) VALUES
('00000000-0000-0000-0000-000000000003', 1, 'I need help planning a vacation to Japan', 'Japan', '{"type": "planning"}'::jsonb),
('00000000-0000-0000-0000-000000000003', 2, 'What are the best months to visit?', 'month', '{"type": "follow_up"}'::jsonb),
('00000000-0000-0000-0000-000000000003', 3, 'How much should I budget for a 2-week trip?', 'budget', '{"type": "follow_up"}'::jsonb);

-- ============================================================
-- SAMPLE LSM DATA (for testing memory retrieval)
-- ============================================================
INSERT INTO lsm_storage (user_id, time_bucket, semantic_tags, summary_text, source_run_ids, metadata) VALUES
(
    '00000000-0000-0000-0000-000000000000',  -- Test user
    '2025-W46',
    ARRAY['project', 'alpha', 'planning', 'deadlines'],
    'User discussed Project Alpha launch timeline. Key decisions: MVP by end of Q1, focus on core features first, team of 5 developers. Main concerns: tight deadline, resource allocation. Action items: hire 2 more devs, create detailed sprint plan.',
    ARRAY[]::UUID[],
    '{"confidence": 0.95, "session_count": 3}'::jsonb
),
(
    '00000000-0000-0000-0000-000000000000',
    '2025-W45',
    ARRAY['travel', 'japan', 'vacation', 'budget'],
    'User inquired about travel to Japan. Discussed best seasons (spring for cherry blossoms, fall for foliage). Budget estimate: $3000-5000 for 2 weeks including flights, accommodation, food. Recommended cities: Tokyo, Kyoto, Osaka.',
    ARRAY[]::UUID[],
    '{"confidence": 0.90, "session_count": 2}'::jsonb
);

-- ============================================================
-- CREATE TEST USER (for Test Runner)
-- Note: In real system, users table would be separate
-- For MVP, we just use a known UUID
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Seeds inserted successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Data inserted:';
    RAISE NOTICE '   - 4 system_prompts (analyzer, assembler, final_responder, archivist)';
    RAISE NOTICE '   - 3 test scenarios (8 dialog steps total)';
    RAISE NOTICE '   - 2 sample LSM memories';
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Test User ID: 00000000-0000-0000-0000-000000000000';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Next: Create Test Runner (Step 2)';
END $$;
