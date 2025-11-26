# MaaS MVP - Memory as a Service

Event-Driven AI Mentor with Long-term Semantic Memory

## Architecture Overview

- **Event-Driven System**: PostgreSQL LISTEN/NOTIFY for module communication
- **Blackboard Pattern**: Modules communicate via shared database state
- **State Machine**: Pipeline status transitions (NEW → ANALYZING → ANALYZED → READY → COMPLETED)
- **Test-First Approach**: Test Runner validates each module incrementally

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Database**: Supabase (PostgreSQL managed)
- **LLM**: OpenAI API (gpt-4o-mini / gpt-4o)
- **HTTP Server**: Express

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
OPENAI_API_KEY=sk-...
PORT=3000
TEST_USER_ID=00000000-0000-0000-0000-000000000000
```

### 3. Test Database Connection

```bash
ts-node src/test-connection.ts
```

Expected output:
```
✅ Database connection successful!
   Server time: 2025-11-25 12:00:00
   PostgreSQL version: PostgreSQL 15.x
```

### 4. Create Database Schema

```bash
# Run SQL files in Supabase SQL Editor or via psql
psql $DATABASE_URL < db/schema.sql
psql $DATABASE_URL < db/seeds.sql
```

## Project Structure

```
MaaS2/
├── src/
│   ├── agents/          # Agent modules (Analyzer, Assembler, Responder)
│   ├── orchestrator/    # LISTEN/NOTIFY event coordinator
│   ├── test-runner/     # Test framework with mock mode
│   ├── utils/           # Shared utilities (db, logger)
│   └── server.ts        # Main HTTP server
├── db/
│   ├── schema.sql       # Database schema (6 tables + triggers)
│   └── seeds.sql        # Initial data (system_prompts, test scenarios)
├── public/
│   └── test-runner/     # Test Runner UI
└── dist/                # Compiled JavaScript (generated)
```

## Development Workflow

### Phase 1-3: MVP (Backend Only) - **32-48 hours**

#### Phase 1: Core Infrastructure
1. ✅ **Step 0**: Project preparation (structure, dependencies, Supabase)
2. ✅ **Step 1**: Database schema (6 tables + triggers + seeds)
3. ✅ **Step 2**: Test Runner (mock mode) - **PRIORITY!**
4. **Step 3**: Orchestrator (LISTEN/NOTIFY logic)
5. **Step 4**: Agent Stubs (status-changing placeholders)

#### Phase 2: Real Implementations
6. **Step 5**: Analyzer implementation (query analysis + LSM search)
7. **Step 6**: Assembler implementation (context builder)
8. **Step 7**: Final Responder implementation (LLM caller)
9. **Step 8**: Logger + Archivist (background processing)

#### Phase 3: Polish
10. **Step 9**: Error handling + retries
11. **Step 10**: Monitoring + metrics
12. **Step 11**: Security + rate limiting

### Phase 4: Frontend Integration (Post-MVP) - **27-36 hours**

> **Note**: Frontend is added AFTER MVP completion. MVP is a pure backend system.

#### Architecture
```
┌─────────────────────┐         ┌─────────────────────┐
│  Frontend (React)   │         │  Backend (Node.js)  │
│                     │         │                     │
│  Supabase SDK:      │         │  Direct Postgres:   │
│  • Auth             │         │  • LISTEN/NOTIFY    │
│  • Realtime         │         │  • Orchestrator     │
│  • Storage          │         │  • Agents           │
│  • RLS              │         │  • Triggers         │
│                     │         │                     │
│  SUPABASE_URL       │         │  DATABASE_URL       │
│  ANON_KEY           │         │                     │
└─────────────────────┘         └─────────────────────┘
         ↓                               ↓
    ┌─────────────────────────────────────────┐
    │      Supabase PostgreSQL Database       │
    └─────────────────────────────────────────┘
```

#### Frontend Steps
13. **Step 12**: Frontend Setup (React + Vite + Supabase SDK)
14. **Step 13**: Authentication UI (Login/Signup via Supabase Auth)
15. **Step 14**: Chat Interface (message list + input + markdown)
16. **Step 15**: Realtime Updates (live status via Supabase Realtime)
17. **Step 16**: History & Search (infinite scroll + filters)
18. **Step 17**: Admin Panel (metrics + prompt management)
19. **Step 18**: Polish & Deploy (mobile + dark mode + production)

#### Why Two Approaches?
- **Frontend** needs: Auth, Realtime, RLS → Supabase SDK
- **Backend** needs: LISTEN/NOTIFY, Triggers → Direct PostgreSQL
- Both connect to the **same database**, different methods

## Running the System

### Start Orchestrator (Event Listener)

```bash
npm run orchestrator
```

### Start HTTP Server

```bash
npm run dev
```

### Run Test Runner

```bash
# CLI
npm run test-runner

# Web UI
open http://localhost:3000/test-runner
```

## Testing Approach

**Test-First Development**: Test Runner is built FIRST with mock mode to validate the event-driven pipeline before implementing real logic.

1. **Step 2**: Test Runner with mock responses (self-contained test)
2. **Step 3**: Orchestrator - see NOTIFY events in logs
3. **Step 4**: Agent Stubs - full pipeline with fake responses
4. **Steps 5-11**: Replace stubs with real implementations one by one

Each module is validated with Test Runner before moving to the next step.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: System architecture (modules, requirements, interfaces)
- **[PIPELINE.md](./PIPELINE.md)**: Processes and interactions (state machine, triggers, flows)
- **[BACKLOG.md](./BACKLOG.md)**: Development roadmap (steps, success criteria, time estimates)

## License

MIT
