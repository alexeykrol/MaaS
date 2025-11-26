# Project Intake Form

**Purpose:** Fill this document BEFORE starting development to provide AI agents with essential context
**Status:** ✅ FILLED
**Migration Status:** [NOT MIGRATED]
**Last Updated:** 2025-11-25

---

## 🎯 Project Overview

### 1. Ключевая идея (Elevator Pitch)
**Опишите суть приложения в ОДНОМ предложении:**

Event-Driven AI система с долгосрочной семантической памятью (Memory as a Service), которая помнит контекст прошлых диалогов и использует его для более качественных ответов.

---

### 2. Проблема (The Problem)
**Какую конкретную проблему пользователя вы решаете?**

Современные LLM не имеют долгосрочной памяти между сессиями. Каждый новый диалог начинается с чистого листа, теряя весь контекст предыдущих взаимодействий. Пользователям приходится каждый раз заново объяснять контекст своих проектов.

**Почему существующие решения не работают?**

- Стандартные чат-боты: нет памяти между сессиями
- Vector databases: требуют сложной настройки и не структурируют информацию семантически
- RAG системы: не оптимизированы для диалогового контекста
- Существующие решения: не используют event-driven архитектуру для масштабируемости

---

### 3. Решение (The Solution)
**Как ИМЕННО ваше приложение решает эту проблему?**

MaaS реализует многоуровневую систему памяти:
1. **raw_logs** - сырой лог всех диалогов
2. **lsm_storage** - Long-term Semantic Memory с тегами и summary
3. **Analyzer** - определяет нужен ли контекст из памяти
4. **Assembler** - собирает релевантный контекст
5. **Archivist** - периодически архивирует диалоги в LSM

**Какую уникальную ценность вы даете?**

- AI помнит все прошлые диалоги и использует контекст
- Event-driven архитектура для масштабируемости
- Модульность: каждый агент независим и заменяем
- Hot-swap промптов без изменения кода

---

### 4. Целевая аудитория (Target Audience)
**Для КОГО вы создаете этот продукт?**

Разработчики и исследователи, которые хотят построить AI-систему с долгосрочной памятью.

**Их характеристики:**
- Возраст: 25-45
- Профессия/род деятельности: Разработчики, AI/ML инженеры
- Технологическая грамотность: высокая
- Готовность платить: freemium (free tier + платные API calls)

---

## 👥 User Personas (Портреты пользователей)

### Persona 1: Developer Dave

```
Имя: Dave, 32 года
Роль: Full-stack разработчик, строит AI-приложения
Локация: Удаленная работа, США
```

**Цели:**
Построить AI-ассистента для своего стартапа, который помнит контекст работы с каждым клиентом

**Проблемы (Pain Points):**
Каждый раз при новом запросе к GPT приходится заново передавать весь контекст. Это дорого (токены) и неудобно.

**Поведение с технологиями:**
Активно использует API, Docker, PostgreSQL. Предпочитает self-hosted решения.

---

### Persona 2: Researcher Rita (опционально)

```
Имя: Rita, 28 лет
Роль: AI/ML исследователь
Локация: Берлин, Германия
```

**Цели:**
Изучить event-driven архитектуру для AI систем, использовать как reference implementation.

**Проблемы (Pain Points):**
Большинство AI проектов - монолиты. Сложно понять архитектуру и модифицировать.

---

## 🗺️ User Flows (Сценарии взаимодействия)

### Ключевой сценарий 1: Запрос с использованием памяти

```
1. Пользователь отправляет запрос через HTTP POST /api/query
2. Request Handler создает запись в pipeline_runs (status=NEW)
3. Orchestrator получает NOTIFY событие
4. Analyzer анализирует запрос, ищет релевантный контекст в LSM
5. Assembler собирает финальный промпт с контекстом
6. Final Responder вызывает OpenAI API
7. Ответ сохраняется в pipeline_runs (status=COMPLETED)
8. Logger записывает диалог в raw_logs
9. Пользователь получает ответ с учетом истории
```

---

### Ключевой сценарий 2: Архивация диалогов (фоновый)

```
1. Archivist запускается по расписанию (cron) или вручную
2. Читает raw_logs за период (например, за день)
3. Анализирует диалоги, выделяет ключевые темы
4. Создает LSM запись с tags и summary
5. Сохраняет ссылки на обработанные логи (raw_log_ids)
6. LSM доступен для будущих запросов через Analyzer
```

---

### Ключевой сценарий 3: Тестирование через Test Runner

```
1. Разработчик открывает http://localhost:3000/test-runner
2. Видит список тестовых сценариев
3. Запускает сценарий (например, "Simple Dialog")
4. Test Runner создает pipeline_runs для каждого шага
5. Видит прогресс в UI (RUNNING → PASSED/FAILED)
6. Проверяет что все модули работают корректно
```

---

## 🛠️ Technology Stack

### 4. Frontend Framework
**Selected:** Vanilla JS (только для Test Runner UI в MVP). React + Vite планируется post-MVP.

---

### 5. Language
**Selected:** TypeScript (strict mode)

---

### 6. Styling Solution
**Selected:** Plain CSS (для Test Runner). TailwindCSS планируется для frontend post-MVP.

---

### 7. Backend / Database

**Backend approach:**
**Selected:** Custom backend (Node.js + Express + TypeScript)

**Database type:**
**Selected:** PostgreSQL (Supabase managed)

---

### 8. Authentication

**Selected:** No auth для MVP (backend-only). Supabase Auth планируется post-MVP.

---

### 9. Hosting / Deployment

**Selected:** Self-hosted / Local development для MVP. Vercel/Railway планируется для production.

---

## ✨ Core Features (MVP)

### 10a. Уникальные функции (Ваша ценность)

**Priority order (most important first):**

1. **Event-Driven Pipeline** - PostgreSQL LISTEN/NOTIFY для координации модулей
2. **Long-term Semantic Memory (LSM)** - хранение сжатых summary с тегами
3. **Analyzer Agent** - анализ запросов и поиск релевантного контекста
4. **Assembler Agent** - сборка финального промпта с контекстом
5. **Archivist Agent** - автоматическая архивация диалогов в LSM
6. **Test Runner** - UI для тестирования всего pipeline

**Какую уникальную ценность дают эти функции?**

AI система которая помнит и использует контекст прошлых диалогов. Модульная архитектура позволяет заменять/улучшать отдельные компоненты без переписывания всей системы.

---

### 10b. Стандартные функции (Ready-to-use)

**Выбранные стандартные функции:**

- **LLM API** - OpenAI API (gpt-4o-mini для Analyzer/Archivist, gpt-4o для Final Responder)
- **Database** - Supabase (PostgreSQL managed с бесплатным tier)
- **HTTP Server** - Express.js

---

### 11. User Roles

**Selected:** No roles для MVP (single user system)

Post-MVP планируется:
- Admin - управление промптами, просмотр всех запросов
- User - только свои запросы (RLS в Supabase)

---

## 📊 Data Structure

### 12. Main Entities (Database Tables)

```
pipeline_runs (State Machine)
  - id (UUID), user_id (UUID), user_query (TEXT)
  - status (VARCHAR): NEW → ANALYZING → ANALYZED → ASSEMBLING → READY → RESPONDING → COMPLETED
  - analysis_result (JSONB), final_context_payload (TEXT), final_answer (TEXT)
  - error_message (TEXT), created_at, updated_at

lsm_storage (Long-term Semantic Memory)
  - id (UUID)
  - time_bucket_start (DATE), time_bucket_end (DATE)
  - tags (TEXT[]), summary (TEXT)
  - raw_log_ids (UUID[])
  - created_at

system_prompts (Agent Prompts)
  - role_name (VARCHAR PK): Analyzer, Assembler, Archivist, FinalResponder
  - prompt_template (TEXT), is_active (BOOLEAN), version (INTEGER)
  - updated_at

raw_logs (Inference Log)
  - id (UUID), user_id (UUID)
  - message_type (VARCHAR): user_query, assistant_response
  - content (TEXT), metadata (JSONB)
  - created_at

test_dialogs (Test Scenarios)
  - id (UUID), scenario_id (UUID), step (INTEGER)
  - user_query (TEXT), expected_keyword (TEXT)
  - metadata (JSONB), created_at

test_runs (Test Results)
  - id (UUID), scenario_id (UUID), step (INTEGER)
  - pipeline_run_id (UUID FK), status (VARCHAR)
  - final_answer (TEXT), validation_result (JSONB)
  - error_message (TEXT), created_at, completed_at
```

---

### 13. Relationships

- One User can have many pipeline_runs (1:N)
- One pipeline_run creates one entry in raw_logs for query and one for response (1:2)
- One LSM record references many raw_logs (1:N via raw_log_ids array)
- One test_scenario has many test_dialogs steps (1:N)
- One test_run references one pipeline_run (1:1)

---

## 🔌 External Integrations

### 14. Third-Party Services

**Selected integrations:**
- **OpenAI API** - LLM для всех агентов (gpt-4o-mini, gpt-4o)
- **Supabase** - Managed PostgreSQL с LISTEN/NOTIFY support

---

### 15. API Requirements

**Selected:** Yes, REST API

**Описание:**
- POST /api/query - создать новый запрос
- GET /api/test/scenarios - список тестовых сценариев
- POST /api/test/run/:scenario_id - запустить тест
- GET /api/test/runs/:scenario_id - результаты теста

---

## 🎨 UI/UX Requirements

### 16. Design Reference

- Terminal/CLI aesthetic для Test Runner (green on black)
- Минималистичный, функциональный UI

---

### 17. Design Assets Available?

**Selected:** No, AI should propose basic UI (уже реализовано для Test Runner)

---

### 18. Responsive Requirements

**Selected:** Desktop only для MVP. Responsive планируется post-MVP.

---

## 🔐 Security & Compliance

### 19. Security Requirements

**Selected:**
- [x] Standard web security (XSS, CSRF protection)
- [ ] GDPR compliance - планируется post-MVP

---

### 20. Data Privacy

**Selected:** Any region (no restrictions) для MVP

---

## 📈 Scale & Performance

### 21. Expected Scale

**Selected:** < 100 users (prototype/MVP)

---

### 22. Performance Requirements

- Orchestrator response to NOTIFY: < 10ms
- Analyzer processing: < 3 seconds
- Full pipeline (query to answer): < 30 seconds
- Test Runner UI updates: real-time polling every 1s

---

## 💰 Budget & Timeline

### 23. Development Timeline

**Selected:** 1-2 weeks для MVP (32-48 hours estimated)

---

### 24. Budget Constraints

Использовать free tier везде где возможно:
- Supabase free tier (500MB database)
- OpenAI pay-as-you-go (минимальные расходы на тесты)

---

## 🔄 Development Approach

### 25a. Модульная структура

**Selected:** Да, модульная структура (рекомендовано!)

**Модули:**
1. Request Handler
2. Logger
3. Orchestrator
4. Analyzer
5. Assembler
6. Final Responder
7. Archivist
8. Test Runner

Каждый модуль независим, имеет четкий вход/выход, тестируется отдельно.

---

### 25b. Development Style

**Selected:** Iterative - build feature by feature

**Как разрабатываем:**
Test-First подход. Test Runner строится первым, затем каждый модуль добавляется и тестируется через Test Runner перед переходом к следующему.

---

### 26. Testing Requirements

**Selected:**
- [x] Manual testing only (через Test Runner UI)
- [ ] Unit tests - планируется post-MVP

---

## 📚 Reference Materials

### 27. Similar Projects

Нет прямых аналогов. Вдохновение:
- LangChain memory modules
- LlamaIndex document stores
- PostgreSQL LISTEN/NOTIFY patterns

---

### 28. Existing Codebase

**Selected:** Existing codebase to extend
- Location: /Users/alexeykrolmini/Downloads/Code/MaaS2
- What needs to be added: Шаги 3-11 по BACKLOG.md

---

## 🎯 Success Criteria

### 29. MVP Definition of Done

- [x] Database schema created (6 tables + triggers)
- [x] Test Runner working (mock mode)
- [ ] Orchestrator listens to NOTIFY events
- [ ] Agent stubs change statuses correctly
- [ ] Full pipeline works end-to-end with stubs
- [ ] Analyzer calls OpenAI and returns real analysis
- [ ] Assembler builds context correctly
- [ ] Final Responder returns real LLM answers
- [ ] Archivist creates LSM records
- [ ] Test scenarios pass with real implementations
- [ ] Error handling and retries work

---

### 30. Post-MVP Plans

- Frontend (React + Vite + Supabase SDK)
- Authentication (Supabase Auth)
- Realtime UI updates
- History & Search
- Admin Panel
- Mobile responsive
- Production deployment

---

## 📝 Additional Notes

### 31. Special Requirements or Constraints

- MVP is backend-only (no frontend except Test Runner)
- PostgreSQL LISTEN/NOTIFY is critical - cannot use other DBs
- Supabase chosen for managed PostgreSQL with free tier
- OpenAI API used for all LLM calls (no local models)
- Event-driven architecture - модули общаются через БД, не напрямую

---

## ✅ Completion Checklist

**Before starting development, ensure:**

- [x] All sections marked with [ОТВЕТИТЬ] are filled
- [x] Technology stack is clearly defined
- [x] MVP features are prioritized
- [x] Data structure is outlined
- [x] Reference materials are provided (if any)
- [x] This file is committed to git
- [x] BACKLOG.md is updated with initial features
- [x] ARCHITECTURE.md is updated with tech stack

---

## 📋 Template Version

**Version:** 2.0 (Filled for MaaS MVP)
**Last Updated:** 2025-11-25
**Maintained by:** AI Agent + Project Lead

---

*This intake form ensures AI agents have all necessary context to start development efficiently*
