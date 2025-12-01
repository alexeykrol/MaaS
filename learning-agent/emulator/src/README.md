# Test Runner - Test-First Development Framework

The Test Runner is the **priority module** that validates all subsequent development in the MaaS MVP system.

## Purpose

- **Test-First Approach**: Built FIRST to enable incremental validation
- **Mock Mode**: Tests event-driven pipeline without real LLM calls
- **Real Mode**: Validates actual pipeline execution with Orchestrator + Agents
- **Visual Feedback**: Web UI and CLI for monitoring test execution

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Test Runner                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Engine   │  │   API    │  │  Web UI/CLI  │  │
│  │            │  │          │  │              │  │
│  │ • Mock     │←→│ REST     │←→│ • Browser    │  │
│  │ • Real     │  │ Endpoints│  │ • Terminal   │  │
│  │ • Validate │  │          │  │              │  │
│  └────────────┘  └──────────┘  └──────────────┘  │
│         ↓                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │           Database (Supabase)                 │ │
│  │  • test_dialogs   (scenarios)                 │ │
│  │  • test_runs      (results)                   │ │
│  │  • pipeline_runs  (state machine)             │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Two Modes

### Mock Mode (Step 2)

- **Purpose**: Test the Test Runner itself in isolation
- **Behavior**: Simulates responses without running Orchestrator
- **Use Case**: Validate Test Runner logic before other modules exist
- **Response Time**: ~500ms (simulated delay)

### Real Mode (Steps 3+)

- **Purpose**: Validate actual pipeline execution
- **Behavior**: Waits for Orchestrator + Agents to process request
- **Use Case**: End-to-end testing of complete system
- **Response Time**: Variable (depends on LLM API)

## Files

```
src/test-runner/
├── engine.ts        # Core Test Runner logic (TestRunnerEngine class)
├── api.ts           # REST API endpoints
├── cli.ts           # Command-line interface
└── README.md        # This file

public/test-runner/
└── index.html       # Web UI (retro terminal theme)
```

## Usage

### Web UI (Recommended)

```bash
# 1. Start the server
npm run dev

# 2. Open browser
open http://localhost:3000/test-runner

# 3. Click "RUN ▶" on any scenario
# 4. Watch results in real-time
```

**Features**:
- Retro green-on-black terminal aesthetic
- Mode toggle (MOCK/REAL)
- Real-time results table
- Visual validation feedback
- Error handling

### CLI

```bash
# Interactive mode
npm run test-runner

# Direct execution
npm run test-runner <scenario-id>

# Example
npm run test-runner 00000000-0000-0000-0000-000000000001
```

### REST API

**List scenarios**
```bash
curl http://localhost:3000/api/test-runner/scenarios
```

**Run scenario**
```bash
curl -X POST http://localhost:3000/api/test-runner/run/00000000-0000-0000-0000-000000000001
```

**Toggle mode**
```bash
curl -X POST http://localhost:3000/api/test-runner/mode \
  -H "Content-Type: application/json" \
  -d '{"mock": false}'
```

**Get results**
```bash
curl http://localhost:3000/api/test-runner/results/00000000-0000-0000-0000-000000000001
```

## Test Scenarios

Three scenarios are pre-loaded in `db/seeds.sql`:

### Scenario 1: Simple General Knowledge (2 steps)
```
00000000-0000-0000-0000-000000000001
- "What is the capital of France?"
- "Tell me more about Paris"
```

### Scenario 2: Memory Recall (2 steps)
```
00000000-0000-0000-0000-000000000002
- "I discussed project Alpha with you last week. What did we decide?"
- "What were the main action items?"
```

### Scenario 3: Multi-turn Conversation (3 steps)
```
00000000-0000-0000-0000-000000000003
- "Help me plan a vacation to Japan"
- "What are the best months to visit?"
- "How much should I budget for 2 weeks?"
```

## Validation Logic

Each test step can have an `expected_keyword` for validation:

1. **No keyword**: Just checks that response exists
2. **With keyword**: Checks that response contains the keyword (case-insensitive)

Example:
- Query: "What is the capital of France?"
- Expected: "Paris"
- Validation: Pass if response contains "Paris" (case-insensitive)

## Test-First Development Flow

### Step 2 (Current): Test Runner with Mock Mode
```bash
npm run dev
# Open http://localhost:3000/test-runner
# Click RUN - see mock responses
# ✅ Validates: Test Runner works in isolation
```

### Step 3: Orchestrator
```bash
# Terminal 1: Start Orchestrator
npm run orchestrator

# Terminal 2: Start Server
npm run dev

# Switch to REAL mode in Test Runner UI
# Run scenario - see NOTIFY events in Orchestrator logs
# ✅ Validates: LISTEN/NOTIFY works
```

### Step 4: Agent Stubs
```bash
# Same setup as Step 3
# Run scenario - full pipeline with stub responses
# ✅ Validates: State machine transitions work
```

### Steps 5-11: Real Implementations
```bash
# Same setup
# Run scenario - see real LLM responses
# ✅ Validates: Each module as it's implemented
```

## Database Tables

### test_dialogs
Stores pre-defined test scenarios:
```sql
scenario_id UUID    -- Groups steps into scenarios
step        INTEGER -- Order of steps
user_query  TEXT    -- The test input
expected_keyword TEXT NULL -- Optional validation keyword
```

### test_runs
Stores execution history:
```sql
scenario_id UUID         -- Which scenario was run
step        INTEGER       -- Which step
pipeline_run_id UUID     -- Link to actual pipeline
status      VARCHAR(50)  -- RUNNING/PASSED/FAILED
final_answer TEXT        -- Response received
validation_result JSONB  -- Details of validation
```

## Implementation Details

### TestRunnerEngine Class

**Constructor Options**:
```typescript
new TestRunnerEngine({
  userId: 'optional-user-id',
  mockMode: true  // true = mock, false = real
})
```

**Key Methods**:
```typescript
// Get available scenarios
await engine.getScenarios()

// Run complete scenario
await engine.runScenario(scenarioId)

// Get historical results
await engine.getResults(scenarioId)

// Toggle mode
engine.setMockMode(false)
```

**Events**:
```typescript
engine.on('step-complete', (result) => {
  console.log(`Step ${result.step}: ${result.status}`);
});
```

## Success Criteria (from BACKLOG.md)

- [x] Test Runner engine with mock mode
- [x] REST API with 4 endpoints
- [x] Web UI with retro terminal theme
- [x] CLI interface
- [x] 3 test scenarios loaded
- [x] Validation logic implemented
- [x] Mode toggle (MOCK/REAL)
- [x] Real-time results display

## Next Steps

1. **Finish Step 2**: Run migrations and test the Test Runner
   ```bash
   npm run db:migrate
   npm run dev
   # Open http://localhost:3000/test-runner
   ```

2. **Proceed to Step 3**: Build Orchestrator
   - Test Runner will validate that LISTEN/NOTIFY works
   - Switch to REAL mode to see events in Orchestrator logs

3. **Proceed to Step 4**: Build Agent Stubs
   - Test Runner will validate full pipeline flow
   - See state transitions (NEW → ANALYZING → ANALYZED → etc.)

## Troubleshooting

### "Failed to load scenarios"
- Check database connection: `npm run db:test`
- Verify migrations ran: `npm run db:migrate`
- Check test_dialogs table has data: `SELECT COUNT(*) FROM test_dialogs;`

### "Timeout waiting for pipeline completion"
- Make sure Orchestrator is running: `npm run orchestrator`
- Check pipeline_runs table for stuck records
- Verify status transitions are happening

### Mock mode not working
- Check server logs for errors
- Verify Test Runner is initialized correctly
- Try restarting server: `npm run dev`

## Architecture Notes

- **Stateless**: Each test run creates new pipeline_runs entry
- **Idempotent**: Can run same scenario multiple times
- **Event-Driven**: Integrates with LISTEN/NOTIFY in real mode
- **Self-Contained**: Works independently in mock mode
