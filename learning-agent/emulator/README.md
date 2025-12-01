# User Emulator

**Version:** 0.3.0
**Status:** Active Development
**Part of:** MaaS Learning Agent

---

## Overview

User Emulator generates synthetic Student/Mentor dialogs for training and testing the MaaS memory system. Each emulation session creates unique user identities, allowing isolated memory testing.

## Emulation Modes

| Mode | Description | Memory | Requires |
|------|-------------|--------|----------|
| **Direct** | OpenAI API calls only | No cross-dialog memory | - |
| **Pipeline** | Routes through MaaS | Uses LSM memory! | Orchestrator |

### Direct Mode (Default)
- Student and Mentor both use direct OpenAI calls
- Each dialog is independent (no memory between dialogs)
- Fast, good for basic testing

### Pipeline Mode
- Student uses direct OpenAI (simulates user input)
- Mentor responses route through MaaS pipeline
- **Uses long-term semantic memory (LSM)**
- Same user_id across dialogs enables memory continuity
- Requires `npm run orchestrator` to be running

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Emulator UI                        │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Config  │  │  Dialog Output   │  │   System Log     │  │
│  │  Panel   │  │     Panel        │  │     Panel        │  │
│  └────┬─────┘  └────────▲─────────┘  └────────▲─────────┘  │
└───────┼────────────────┼──────────────────────┼─────────────┘
        │                │                      │
        ▼                │                      │
┌───────────────┐        │                      │
│ POST /api/    │        │                      │
│ emulator/     │────────┴──────────────────────┘
│ generate      │
└───────┬───────┘
        │
        ▼
┌───────────────┐     ┌───────────────┐
│   OpenAI      │────▶│   raw_logs    │
│  gpt-4o-mini  │     │    (DB)       │
└───────────────┘     └───────────────┘
```

## Files

```
learning-agent/emulator/
├── public/
│   └── emulator.html      # UI (single-page app)
├── src/
│   ├── api.ts             # Test Runner API (legacy)
│   ├── emulator-api.ts    # Emulator API endpoints
│   ├── engine.ts          # Test Runner engine
│   └── cli.ts             # CLI interface
├── CHANGELOG.md           # Version history
└── README.md              # This file
```

## API Endpoints

### POST /api/emulator/generate

Generate Student/Mentor dialogs.

**Request:**
```json
{
  "studentPrompt": "You are a curious student...",
  "mentorPrompt": "You are an experienced mentor...",
  "topic": "Understanding recursion",
  "dialogCount": 1,
  "turnsPerDialog": 3,
  "mode": "direct"
}
```

**Response:**
```json
{
  "success": true,
  "userIds": {
    "student": "uuid-...",
    "mentor": "uuid-..."
  },
  "dialogs": [
    {
      "dialog_id": "uuid-...",
      "topic": "Understanding recursion",
      "messages": [
        {
          "role": "student",
          "content": "I want to learn about...",
          "timestamp": "2024-11-29T...",
          "user_id": "uuid-..."
        }
      ]
    }
  ]
}
```

### GET /api/emulator/status

Get current emulation status.

**Response:**
```json
{
  "success": true,
  "isEmulating": false,
  "progress": 0,
  "total": 0,
  "dialogsCompleted": 0
}
```

### POST /api/emulator/mode

Set emulation mode.

**Request:**
```json
{
  "mode": "pipeline"
}
```

**Response:**
```json
{
  "success": true,
  "mode": "pipeline",
  "description": "Mentor responses will use MaaS pipeline with LSM memory"
}
```

### GET /api/emulator/mode

Get current emulation mode.

## Data Storage

Messages are stored in `raw_logs` table:

| Column | Value |
|--------|-------|
| user_id | Unique per role per session |
| log_type | `EMULATED_MESSAGE` |
| log_data | `{ role, content, source, dialog_id, turn, emulated_role }` |

## Usage

1. Open http://localhost:3000/emulator
2. Configure Student/Mentor meta-prompts
3. Set topic and dialog parameters
4. Click "Start Emulation"
5. Watch dialogs generate in real-time
6. Check System Log for detailed events

## Dependencies

- Express.js (server)
- OpenAI API (gpt-4o-mini)
- PostgreSQL (raw_logs table)

## Related Modules

- **Analyst** — will analyze emulated dialogs for quality
- **Teacher** — will generate improvement hypotheses
- **Tuner** — will apply parameter changes

---

See [CHANGELOG.md](./CHANGELOG.md) for version history.
