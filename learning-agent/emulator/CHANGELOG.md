# User Emulator - Changelog

All notable changes to the User Emulator module.

Format: [Semantic Versioning](https://semver.org/)

---

## [0.3.1] - 2025-11-29

### Added
- **localStorage Persistence** — prompts, topic, mode saved to browser
- **Reset to Defaults** button — restore all settings to initial values
- **Both roles through pipeline** — Student AND Mentor route through MaaS in Pipeline mode
- **Role Instructions** — `[ROLE INSTRUCTION: ...]` prefix in pipeline queries preserves role behavior

### Changed
- Orchestrator now integrated into server.ts (no separate command needed)
- Visual feedback for save status ("✓ Saved")

### Technical
- `saveConfig()` / `loadConfig()` using localStorage
- `setupAutoSave()` event listeners on all config fields
- Role instruction injection in `generateDialog()` function

---

## [0.3.0] - 2025-11-28

### Added
- **Pipeline Mode** — Route Mentor responses through MaaS pipeline with LSM memory
- Two emulation modes: Direct (OpenAI only) vs Pipeline (MaaS Memory)
- Mode selector dropdown in UI with hint text
- Mode info in System Log and Markdown export
- Pipeline timeout handling (60s default)

### Technical
- POST /api/emulator/mode endpoint to set mode
- GET /api/emulator/mode endpoint to get current mode
- getMentorResponseViaPipeline() polls pipeline_runs until COMPLETED
- Same user_id used across dialogs in pipeline mode for memory continuity

### Note
Pipeline mode requires Orchestrator (`npm run dev` now starts both server and orchestrator)

---

## [0.2.1] - 2024-11-29

### Added
- **Export to Markdown** — download dialogs as `.md` file
- Includes meta-prompts, session IDs, all dialogs
- Built-in feedback request template for manual LLM analysis

---

## [0.2.0] - 2024-11-29

### Added
- **System Log Panel** — real-time event logging (right sidebar)
- Log types: info, success, warning, error, student, mentor, db, api
- Server status polling during emulation
- Clear log button
- Version display in UI header

### Changed
- **3-column layout**: Config (280px) | Dialogs (flex) | Log (300px)
- Compact UI design (smaller fonts, tighter spacing)
- Progress bar moved to config panel
- Default: 1 dialog, 3 turns (was 3 dialogs, 4 turns)

### Fixed
- Database schema mismatch (`raw_logs` columns)
- Server state not resetting after abort

---

## [0.1.0] - 2024-11-29

### Added
- **Initial release**
- Student/Mentor dialog generation via OpenAI API
- Meta-prompt configuration for both roles
- Topic, dialog count, turns per dialog settings
- Real dialog generation (not mock)
- Storage to `raw_logs` table with unique user_ids per session
- GitHub-dark theme UI
- Progress indicator
- Error handling with user feedback

### Technical
- Express API: `POST /api/emulator/generate`, `GET /api/emulator/status`
- OpenAI gpt-4o-mini for generation
- Conversation history maintained within each dialog

---

## Roadmap

### [0.4.0] - Planned
- [ ] Real-time streaming (SSE) for live message display
- [ ] Export dialogs to JSON/CSV
- [ ] Multiple topic presets
- [ ] Integration with Analyst module
- [ ] Quality metrics for generated dialogs
- [ ] A/B testing different meta-prompts
- [ ] Compare Direct vs Pipeline response quality

---

## Version Format

`MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes to API or data format
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, minor improvements
