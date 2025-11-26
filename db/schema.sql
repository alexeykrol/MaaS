-- MaaS MVP Database Schema
-- 6 tables: 4 main + 2 test
-- PostgreSQL 15+ / Supabase compatible

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE 1: pipeline_runs (The State Machine)
-- Stores the lifecycle of a single user request
-- ============================================================
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_query TEXT NOT NULL,

    -- State machine status with constraints
    status VARCHAR(50) DEFAULT 'NEW' CHECK (
        status IN (
            'NEW',          -- Initial state
            'ANALYZING',    -- Analyzer is working
            'ANALYZED',     -- Analysis complete
            'ASSEMBLING',   -- Assembler is working
            'READY',        -- Context ready
            'RESPONDING',   -- Final model is working
            'COMPLETED',    -- Success
            'FAILED'        -- Error occurred
        )
    ),

    -- Payloads from each stage
    analysis_result JSONB,              -- Output from Analyzer
    final_context_payload TEXT,         -- Output from Assembler
    final_answer TEXT,                  -- Output from Final Responder

    -- Error tracking
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_user_id ON pipeline_runs(user_id);
CREATE INDEX idx_pipeline_runs_created_at ON pipeline_runs(created_at DESC);

-- ============================================================
-- TABLE 2: lsm_storage (Long-term Semantic Memory)
-- Stores compressed, tagged summaries of historical dialogs
-- ============================================================
CREATE TABLE lsm_storage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,

    -- Temporal indexing
    time_bucket VARCHAR(20) NOT NULL,   -- Format: "2025-W42" (year-week)

    -- Semantic indexing
    semantic_tags TEXT[] NOT NULL,      -- Array of keywords/topics

    -- Content
    summary_text TEXT NOT NULL,         -- Compressed summary
    source_run_ids UUID[],              -- References to original pipeline_runs

    -- Metadata
    embedding_vector FLOAT[],           -- Future: for semantic search
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for search
CREATE INDEX idx_lsm_time_bucket ON lsm_storage(time_bucket);
CREATE INDEX idx_lsm_semantic_tags ON lsm_storage USING GIN(semantic_tags);
CREATE INDEX idx_lsm_user_id ON lsm_storage(user_id);

-- ============================================================
-- TABLE 3: system_prompts (The Brains)
-- Stores prompts for agents, allows hot-swapping logic
-- ============================================================
CREATE TABLE system_prompts (
    role_name VARCHAR(50) PRIMARY KEY,  -- 'analyzer', 'assembler', 'final_responder', 'archivist'
    prompt_template TEXT NOT NULL,
    model_name VARCHAR(50) DEFAULT 'gpt-4o-mini',
    temperature FLOAT DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,

    -- Versioning
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: raw_logs (Async Log Storage)
-- Stores raw interaction logs before processing by Archivist
-- ============================================================
CREATE TABLE raw_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- Log content
    log_type VARCHAR(50) NOT NULL,      -- 'USER_QUERY', 'SYSTEM_RESPONSE', 'ERROR', etc.
    log_data JSONB NOT NULL,

    -- Processing status
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for processing
CREATE INDEX idx_raw_logs_processed ON raw_logs(processed) WHERE processed = false;
CREATE INDEX idx_raw_logs_user_id ON raw_logs(user_id);
CREATE INDEX idx_raw_logs_created_at ON raw_logs(created_at DESC);

-- ============================================================
-- TABLE 5: test_dialogs (Test Scenarios)
-- Stores pre-defined test scenarios for Test Runner
-- ============================================================
CREATE TABLE test_dialogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL,          -- Group multiple steps into one scenario
    step INTEGER NOT NULL,              -- Order of steps (1, 2, 3...)

    -- Test data
    user_query TEXT NOT NULL,
    expected_keyword TEXT,              -- Optional: keyword to check in response

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(scenario_id, step)
);

-- Indexes
CREATE INDEX idx_test_dialogs_scenario ON test_dialogs(scenario_id, step);

-- ============================================================
-- TABLE 6: test_runs (Test Execution History)
-- Stores results of test executions
-- ============================================================
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL,
    step INTEGER NOT NULL,

    -- Link to actual pipeline run
    pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE SET NULL,

    -- Test results
    status VARCHAR(50),                 -- 'PASSED', 'FAILED', 'RUNNING'
    final_answer TEXT,
    validation_result JSONB,            -- Details of validation
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_test_runs_scenario ON test_runs(scenario_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_created_at ON test_runs(created_at DESC);

-- ============================================================
-- TRIGGER: notify_pipeline_change()
-- Sends NOTIFY event whenever pipeline_runs changes
-- This is the heart of the event-driven architecture
-- ============================================================

-- 1. Create the notification function
CREATE OR REPLACE FUNCTION notify_pipeline_change()
RETURNS trigger AS $$
BEGIN
    -- Send notification with JSON payload
    PERFORM pg_notify(
        'pipeline_events',
        json_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'operation', TG_OP  -- 'INSERT' or 'UPDATE'
        )::text
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
CREATE TRIGGER on_pipeline_change
    AFTER INSERT OR UPDATE ON pipeline_runs
    FOR EACH ROW
    EXECUTE FUNCTION notify_pipeline_change();

-- ============================================================
-- HELPER FUNCTION: Update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables that need it
CREATE TRIGGER update_pipeline_runs_updated_at
    BEFORE UPDATE ON pipeline_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_prompts_updated_at
    BEFORE UPDATE ON system_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- COMMENTS (for documentation)
-- ============================================================
COMMENT ON TABLE pipeline_runs IS 'State machine tracking user request lifecycle';
COMMENT ON TABLE lsm_storage IS 'Long-term semantic memory with temporal + semantic indexing';
COMMENT ON TABLE system_prompts IS 'Dynamic agent prompts with versioning';
COMMENT ON TABLE raw_logs IS 'Unprocessed interaction logs for Archivist';
COMMENT ON TABLE test_dialogs IS 'Pre-defined test scenarios';
COMMENT ON TABLE test_runs IS 'Test execution history';
COMMENT ON FUNCTION notify_pipeline_change() IS 'Triggers LISTEN/NOTIFY for event-driven coordination';

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '✅ MaaS MVP Schema created successfully!';
    RAISE NOTICE '   - 6 tables created (4 main + 2 test)';
    RAISE NOTICE '   - Indexes created for performance';
    RAISE NOTICE '   - LISTEN/NOTIFY trigger configured';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Next: Run seeds.sql to populate initial data';
END $$;
