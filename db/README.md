# Database Setup Guide

This directory contains the database schema and seed data for the MaaS MVP.

## Files

- **schema.sql** - Creates 6 tables + LISTEN/NOTIFY triggers
- **seeds.sql** - Inserts initial data (system_prompts, test scenarios, sample LSM data)
- **run-migrations.ts** - TypeScript migration runner

## Quick Start

### Prerequisites

1. **Supabase project** must be created and running
2. **`.env` file** must be configured with `DATABASE_URL`

### Option 1: Using npm scripts (Recommended)

```bash
# Test connection first
npm run db:test

# Run all migrations (schema + seeds)
npm run db:migrate

# Or run separately
npm run db:schema  # Schema only
npm run db:seeds   # Seeds only
```

### Option 2: Using Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create new query
4. Copy contents of `schema.sql` and run
5. Copy contents of `seeds.sql` and run

### Option 3: Using psql CLI

```bash
# Set your DATABASE_URL
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run migrations
psql $DATABASE_URL < db/schema.sql
psql $DATABASE_URL < db/seeds.sql
```

## Database Schema Overview

### 6 Tables

#### Main Tables (4)

1. **pipeline_runs** - State machine tracking user request lifecycle
   - Stores: user_query, status, analysis_result, final_answer
   - Indexed by: status, user_id, created_at

2. **lsm_storage** - Long-term Semantic Memory
   - Stores: time_bucket, semantic_tags, summary_text
   - Indexed by: time_bucket, semantic_tags (GIN), user_id

3. **system_prompts** - Dynamic agent prompts
   - Stores: role_name, prompt_template, model_name, temperature
   - Roles: 'analyzer', 'assembler', 'final_responder', 'archivist'

4. **raw_logs** - Unprocessed interaction logs
   - Stores: pipeline_run_id, log_type, log_data, processed
   - Indexed by: processed (partial index), user_id, created_at

#### Test Tables (2)

5. **test_dialogs** - Pre-defined test scenarios
   - Stores: scenario_id, step, user_query, expected_keyword
   - 3 scenarios included (8 dialog steps total)

6. **test_runs** - Test execution history
   - Stores: scenario_id, pipeline_run_id, status, validation_result
   - Links test scenarios to actual pipeline runs

### Triggers

- **on_pipeline_change** - Fires on INSERT/UPDATE to pipeline_runs
  - Sends NOTIFY to 'pipeline_events' channel
  - Payload: `{id, status, operation}`
  - This is the core of the event-driven architecture

## Verification

After running migrations, verify the setup:

```bash
# The migration script automatically runs verification
npm run db:migrate
```

Expected output:
```
✅ Migration complete!

🔍 Running verification...
   pipeline_runs: 0 rows
   lsm_storage: 2 rows       # 2 sample memories
   system_prompts: 4 rows    # 4 agent prompts
   raw_logs: 0 rows
   test_dialogs: 8 rows      # 8 test steps
   test_runs: 0 rows
```

## Seeded Data

### System Prompts (4)

1. **analyzer** - Determines SPECIFIC_SEARCH vs GENERAL_CHAT intent
2. **assembler** - Builds context from LSM + current query
3. **final_responder** - Generates final answer using context
4. **archivist** - Processes logs into LSM summaries (background)

### Test Scenarios (3)

1. **Scenario 1**: Simple general knowledge (2 steps)
   - "What is the capital of France?"
   - "Tell me more about Paris"

2. **Scenario 2**: Memory-based recall (2 steps)
   - "I discussed project Alpha last week. What did we decide?"
   - "What were the action items?"

3. **Scenario 3**: Multi-turn conversation (3 steps)
   - "Help me plan a vacation to Japan"
   - "What are the best months to visit?"
   - "How much should I budget for 2 weeks?"

### Sample LSM Data (2)

1. **Project Alpha** discussion (2025-W46)
   - Tags: project, alpha, planning, deadlines
   - Summary: MVP timeline, team size, resource allocation

2. **Japan travel** inquiry (2025-W45)
   - Tags: travel, japan, vacation, budget
   - Summary: Best seasons, budget estimates, recommended cities

## Test User

A test user ID is pre-configured for Test Runner:

```
TEST_USER_ID=00000000-0000-0000-0000-000000000000
```

The sample LSM data is associated with this user ID.

## Troubleshooting

### Connection refused

```bash
# Check your .env file
cat .env | grep DATABASE_URL

# Test connection
npm run db:test
```

### Trigger not working

```sql
-- Verify trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_pipeline_change';

-- Manually test NOTIFY
SELECT pg_notify('pipeline_events', '{"test": "value"}');
```

### Table already exists

If you need to reset the database:

```sql
-- CAUTION: This drops all tables!
DROP TABLE IF EXISTS test_runs CASCADE;
DROP TABLE IF EXISTS test_dialogs CASCADE;
DROP TABLE IF EXISTS raw_logs CASCADE;
DROP TABLE IF EXISTS lsm_storage CASCADE;
DROP TABLE IF EXISTS system_prompts CASCADE;
DROP TABLE IF EXISTS pipeline_runs CASCADE;

DROP FUNCTION IF EXISTS notify_pipeline_change() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
```

Then run migrations again.

## Next Steps

After successful migration:

1. **Step 2**: Create Test Runner with mock mode
2. **Step 3**: Create Orchestrator (LISTEN/NOTIFY logic)
3. **Step 4**: Create Agent Stubs
