# Backlog разработки MaaS

## Содержание

### MVP (Backend Only)
1. [Принципы разработки](#принципы-разработки)
2. [Шаг 0: Подготовка](#шаг-0-подготовка)
3. [Шаг 1: База данных](#шаг-1-база-данных)
4. [**Шаг 2: Test Runner** (ПРИОРИТЕТ!)](#шаг-2-test-runner)
5. [Шаг 3: Orchestrator](#шаг-3-orchestrator)
6. [Шаг 4: Agent Stubs](#шаг-4-agent-stubs-заглушки)
7. [Шаг 5: Logger](#шаг-5-logger-v1)
8. [Шаг 6: Analyzer](#шаг-6-analyzer-v1-реальный)
9. [Шаг 7: Assembler](#шаг-7-assembler-v1-реальный)
10. [Шаг 8: Final Responder](#шаг-8-final-responder-v1-реальный)
11. [Шаг 9: Archivist](#шаг-9-archivist-v1)
12. [Шаг 10: Assembler v2 (с LSM)](#шаг-10-assembler-v2-с-lsm)
13. [Шаг 11: Полировка](#шаг-11-полировка)

### Phase 4: Frontend Integration (Post-MVP)
14. [Шаг 12: Frontend Setup](#шаг-12-frontend-setup)
15. [Шаг 13: Authentication UI](#шаг-13-authentication-ui)
16. [Шаг 14: Chat Interface](#шаг-14-chat-interface)
17. [Шаг 15: Realtime Updates](#шаг-15-realtime-updates)
18. [Шаг 16: History & Search](#шаг-16-history--search)
19. [Шаг 17: Admin Panel](#шаг-17-admin-panel)
20. [Шаг 18: Polish & Deploy](#шаг-18-polish--deploy)

---

## Принципы разработки

### Test-First подход
**Test Runner строится первым** и используется для тестирования каждого последующего модуля. Это дает быструю обратную связь на каждом этапе.

### От простого к сложному
Каждый шаг добавляет **одну** новую функциональность поверх предыдущих. Не переходим к следующему шагу, пока текущий не работает.

### Тестируемость
Каждый шаг тестируется через Test Runner. После добавления модуля → запускаем тест → проверяем что работает.

### Инкрементальность
После каждого шага система **работает** end-to-end, просто с ограниченной функциональностью (заглушки постепенно заменяются на реальные модули).

---

## Технический стек (ФИНАЛЬНЫЙ)

```
Backend:    TypeScript + Node.js
Database:   Supabase (PostgreSQL managed)
LLM:        OpenAI API
            - gpt-4o-mini (Analyzer, Archivist)
            - gpt-4o (Final Responder)
Frontend:   Vanilla JS (для Test Runner UI)
```

---

## Шаг 0: Подготовка

### Цель
Создать базовую структуру TypeScript + Node.js проекта с подключением к Supabase.

### Задачи

#### 0.1 Создать структуру проекта
```
/maas-mvp
  /src
    /modules        # Orchestrator, agents
    /test-runner    # Test Runner модуль
    /db             # SQL скрипты
    /utils          # db.ts, llm.ts, config.ts
    - server.ts     # HTTP API
    - main.ts       # Entry для Orchestrator
  /public
    /test-runner    # Test Runner UI
  /tests
  - package.json
  - tsconfig.json
  - .env.example
  - README.md
```

#### 0.2 Установить зависимости
```bash
npm init -y
npm install pg express dotenv openai cors
npm install -D typescript @types/node @types/express @types/pg ts-node nodemon
```

#### 0.3 Создать конфигурацию

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**.env.example**:
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=development
```

**package.json scripts**:
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "nodemon --exec ts-node src/main.ts",
    "dev:server": "nodemon --exec ts-node src/server.ts",
    "start": "node dist/main.js",
    "test:scenario": "ts-node src/scripts/run-test-scenario.ts"
  }
}
```

#### 0.4 Создать утилиту подключения к Supabase

**/src/utils/db.ts**:
```typescript
import { Pool, Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

export async function query(text: string, params?: any[]) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB]', { text: text.substring(0, 100), duration, rows: res.rowCount });
    return res;
}

export async function getClient(): Promise<Client> {
    const client = await pool.connect();
    return client;
}

export default { query, getClient };
```

### Критерий успеха
- [ ] `npm run build` компилируется без ошибок
- [ ] Тестовый запрос к Supabase работает:
  ```typescript
  import db from './utils/db';
  const result = await db.query('SELECT NOW()');
  console.log(result.rows[0]);
  ```

### Время оценка
**1-2 часа**

---

## Шаг 1: База данных

### Цель
Создать полную схему БД в Supabase со всеми 6 таблицами (4 основные + 2 для тестов).

### Задачи

#### 1.1 Создать schema.sql

**/src/db/schema.sql**:

```sql
-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== ОСНОВНЫЕ ТАБЛИЦЫ =====

-- Таблица 1: pipeline_runs (State Machine)
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_query TEXT NOT NULL,

    status VARCHAR(50) DEFAULT 'NEW' CHECK (
        status IN ('NEW', 'ANALYZING', 'ANALYZED',
                   'ASSEMBLING', 'READY', 'RESPONDING',
                   'COMPLETED', 'FAILED')
    ),

    analysis_result JSONB,
    final_context_payload TEXT,
    final_answer TEXT,
    error_message TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_user_id ON pipeline_runs(user_id);
CREATE INDEX idx_pipeline_runs_created_at ON pipeline_runs(created_at DESC);

-- Таблица 2: lsm_storage (Long-term Semantic Memory)
CREATE TABLE lsm_storage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    time_bucket_start DATE NOT NULL,
    time_bucket_end DATE NOT NULL,
    tags TEXT[] NOT NULL,
    summary TEXT NOT NULL,
    raw_log_ids UUID[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_lsm_time_bucket ON lsm_storage(time_bucket_start, time_bucket_end);
CREATE INDEX idx_lsm_tags ON lsm_storage USING GIN(tags);
CREATE INDEX idx_lsm_created_at ON lsm_storage(created_at DESC);

-- Таблица 3: system_prompts (Промпты для агентов)
CREATE TABLE system_prompts (
    role_name VARCHAR(50) PRIMARY KEY,
    prompt_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица 4: raw_logs (Сырой лог инференсов)
CREATE TABLE raw_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    message_type VARCHAR(50) NOT NULL CHECK (
        message_type IN ('user_query', 'assistant_response')
    ),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_raw_logs_user_id ON raw_logs(user_id);
CREATE INDEX idx_raw_logs_created_at ON raw_logs(created_at DESC);
CREATE INDEX idx_raw_logs_message_type ON raw_logs(message_type);

-- ===== ТАБЛИЦЫ ДЛЯ ТЕСТИРОВАНИЯ =====

-- Таблица 5: test_dialogs (Сценарии тестовых диалогов)
CREATE TABLE test_dialogs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL,
    step INTEGER NOT NULL,
    user_query TEXT NOT NULL,
    expected_keyword TEXT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(scenario_id, step)
);

CREATE INDEX idx_test_dialogs_scenario ON test_dialogs(scenario_id, step);

-- Таблица 6: test_runs (Запуски тестов)
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL,
    step INTEGER NOT NULL,
    pipeline_run_id UUID REFERENCES pipeline_runs(id),
    status VARCHAR(50),
    final_answer TEXT,
    validation_result JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    FOREIGN KEY (scenario_id, step) REFERENCES test_dialogs(scenario_id, step)
);

CREATE INDEX idx_test_runs_scenario ON test_runs(scenario_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_pipeline ON test_runs(pipeline_run_id);

-- ===== ТРИГГЕРЫ =====

-- Функция для отправки уведомлений
CREATE OR REPLACE FUNCTION notify_pipeline_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'pipeline_events',
        json_build_object(
            'id', NEW.id,
            'status', NEW.status,
            'operation', TG_OP
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер на изменение статуса
CREATE TRIGGER on_pipeline_change
AFTER INSERT OR UPDATE OF status ON pipeline_runs
FOR EACH ROW
EXECUTE FUNCTION notify_pipeline_change();
```

#### 1.2 Создать seeds.sql

**/src/db/seeds.sql**:

```sql
-- ===== ПРОМПТЫ (ЗАГЛУШКИ) =====

INSERT INTO system_prompts (role_name, prompt_template, version) VALUES
('Analyzer', 'You are a query analyzer. Return JSON with analysis result.', 1),
('Assembler', 'You are a context assembler. Build the final context.', 1),
('Archivist', 'You are an archivist. Summarize dialogues into LSM records.', 1),
('FinalResponder', 'You are an AI assistant. Help the user achieve their goals.', 1);

-- ===== LSM SEED (фиктивные данные для тестов) =====

INSERT INTO lsm_storage (time_bucket_start, time_bucket_end, tags, summary, raw_log_ids) VALUES
('2025-11-20', '2025-11-22',
 ARRAY['Python', 'Architecture', 'MaaS'],
 'Discussed MaaS system architecture. Defined 6 database tables and module structure. Decided on TypeScript + Supabase stack.',
 ARRAY[]::UUID[]),

('2025-11-18', '2025-11-19',
 ARRAY['TypeScript', 'Node.js', 'Design'],
 'Chose TypeScript for backend. Discussed event-driven approach with LISTEN/NOTIFY. Planned Test Runner as first module.',
 ARRAY[]::UUID[]);

-- ===== ТЕСТОВЫЕ СЦЕНАРИИ =====

-- Сценарий 1: Простой диалог (3 шага)
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword) VALUES
('00000000-0000-0000-0000-000000000001', 1, 'Hello, can you help me?', 'help'),
('00000000-0000-0000-0000-000000000001', 2, 'Tell me about Python programming', 'Python'),
('00000000-0000-0000-0000-000000000001', 3, 'What did we discuss earlier?', NULL);

-- Сценарий 2: Тест с контекстом из LSM (2 шага)
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword) VALUES
('00000000-0000-0000-0000-000000000002', 1, 'Explain MaaS architecture', 'architecture'),
('00000000-0000-0000-0000-000000000002', 2, 'What did we decide about the database?', 'Supabase');

-- Сценарий 3: Быстрый тест (1 шаг)
INSERT INTO test_dialogs (scenario_id, step, user_query, expected_keyword) VALUES
('00000000-0000-0000-0000-000000000003', 1, 'What is 2+2?', '4');
```

#### 1.3 Запустить в Supabase

1. Открыть Supabase Dashboard → SQL Editor
2. Скопировать содержимое schema.sql → Execute
3. Скопировать содержимое seeds.sql → Execute

#### 1.4 Проверить подключение из кода

Создать тестовый скрипт **/tests/test-db-connection.ts**:

```typescript
import db from '../src/utils/db';

async function testConnection() {
    console.log('🔌 Testing Supabase connection...\n');

    // Проверка подключения
    const timeResult = await db.query('SELECT NOW() as current_time');
    console.log('✅ Connected:', timeResult.rows[0].current_time);

    // Проверка таблиц
    const tablesResult = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    `);
    console.log('\n📊 Tables:', tablesResult.rows.map(r => r.table_name));

    // Проверка seeds
    const promptsResult = await db.query('SELECT COUNT(*) FROM system_prompts');
    console.log('\n📝 System prompts:', promptsResult.rows[0].count);

    const scenariosResult = await db.query('SELECT DISTINCT scenario_id FROM test_dialogs');
    console.log('🧪 Test scenarios:', scenariosResult.rowCount);

    process.exit(0);
}

testConnection().catch(console.error);
```

### Критерий успеха
- [ ] Все 6 таблиц созданы в Supabase
- [ ] Триггер создан: видим функцию `notify_pipeline_change`
- [ ] Seeds загружены:
  - 4 промпта в `system_prompts`
  - 2 LSM записи
  - 3 тестовых сценария
- [ ] Тестовый скрипт выводит:
  ```
  ✅ Connected
  📊 Tables: [6 таблиц]
  📝 System prompts: 4
  🧪 Test scenarios: 3
  ```

### Время оценка
**2-3 часа**

---

## Шаг 2: Test Runner

### 🎯 ПРИОРИТЕТ! Делаем первым!

### Цель
Создать Test Runner модуль (backend + frontend) для автоматического тестирования pipeline через сценарии диалогов.

### Зачем это первым?
- ✅ Легко протестировать (изолированно от остальных модулей)
- ✅ Можем симулировать ответы модели
- ✅ Будем использовать на ВСЕХ последующих этапах
- ✅ Быстрая обратная связь при разработке

### Задачи

#### 2.1 Создать Test Runner Engine

**/src/test-runner/engine.ts**:

```typescript
import db from '../utils/db';
import { EventEmitter } from 'events';

export class TestRunnerEngine extends EventEmitter {
    private userId: string = '00000000-0000-0000-0000-000000000000';
    private mockMode: boolean = true; // Переключатель mock/real

    async runScenario(scenarioId: string) {
        console.log(`[TestRunner] 🎬 Starting scenario: ${scenarioId}`);

        // Получаем шаги сценария
        const steps = await db.query(`
            SELECT scenario_id, step, user_query, expected_keyword
            FROM test_dialogs
            WHERE scenario_id = $1
            ORDER BY step
        `, [scenarioId]);

        if (steps.rowCount === 0) {
            throw new Error('Scenario not found');
        }

        this.emit('started', {
            scenario_id: scenarioId,
            total_steps: steps.rowCount
        });

        // Запускаем каждый шаг
        for (const stepData of steps.rows) {
            await this.runStep(scenarioId, stepData);
        }

        this.emit('completed', { scenario_id: scenarioId });
        console.log(`[TestRunner] ✅ Completed: ${scenarioId}`);
    }

    private async runStep(scenarioId: string, stepData: any) {
        const { step, user_query, expected_keyword } = stepData;

        console.log(`[TestRunner] Step ${step}: "${user_query}"`);

        this.emit('step-start', {
            scenario_id: scenarioId,
            step,
            user_query
        });

        try {
            // 1. Создаем pipeline_runs
            const pipelineResult = await db.query(`
                INSERT INTO pipeline_runs (user_id, user_query, status)
                VALUES ($1, $2, 'NEW')
                RETURNING id
            `, [this.userId, user_query]);

            const pipelineRunId = pipelineResult.rows[0].id;

            // 2. Создаем test_runs запись
            await db.query(`
                INSERT INTO test_runs (scenario_id, step, pipeline_run_id, status)
                VALUES ($1, $2, $3, 'RUNNING')
            `, [scenarioId, step, pipelineRunId]);

            // 3. Ждем ответа (mock или real)
            const finalAnswer = this.mockMode
                ? await this.simulateResponse(user_query)
                : await this.waitForCompletion(pipelineRunId);

            // 4. Валидация
            const validation = this.validate(finalAnswer, expected_keyword);

            // 5. Обновляем test_runs
            await db.query(`
                UPDATE test_runs
                SET
                    status = $1,
                    final_answer = $2,
                    validation_result = $3,
                    completed_at = NOW()
                WHERE pipeline_run_id = $4
            `, [
                validation.passed ? 'PASSED' : 'FAILED',
                finalAnswer,
                JSON.stringify(validation),
                pipelineRunId
            ]);

            this.emit('step-complete', {
                scenario_id: scenarioId,
                step,
                status: validation.passed ? 'passed' : 'failed',
                final_answer: finalAnswer,
                validation
            });

        } catch (error) {
            console.error(`[TestRunner] ❌ Step ${step} error:`, error);

            await db.query(`
                UPDATE test_runs
                SET status = 'ERROR', error_message = $1, completed_at = NOW()
                WHERE scenario_id = $2 AND step = $3
            `, [error.message, scenarioId, step]);

            this.emit('step-error', {
                scenario_id: scenarioId,
                step,
                error: error.message
            });
        }

        await this.sleep(1000); // Пауза между шагами
    }

    // Mock симуляция (для Шага 2)
    private async simulateResponse(query: string): Promise<string> {
        await this.sleep(500); // Симуляция задержки
        return `Mock response to: "${query}"`;
    }

    // Реальное ожидание (для последующих шагов)
    private async waitForCompletion(
        pipelineRunId: string,
        maxWaitMs: number = 30000
    ): Promise<string> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const result = await db.query(`
                SELECT status, final_answer, error_message
                FROM pipeline_runs
                WHERE id = $1
            `, [pipelineRunId]);

            const row = result.rows[0];

            if (row.status === 'COMPLETED') {
                return row.final_answer;
            }

            if (row.status === 'FAILED') {
                throw new Error(`Pipeline failed: ${row.error_message}`);
            }

            await this.sleep(500);
        }

        throw new Error('Timeout waiting for pipeline completion');
    }

    private validate(answer: string, expectedKeyword: string | null) {
        if (!expectedKeyword) {
            return { passed: true };
        }

        const found = answer.toLowerCase().includes(expectedKeyword.toLowerCase());
        return {
            passed: found,
            expected: expectedKeyword,
            found,
            reason: found ? undefined : `Expected "${expectedKeyword}" not found`
        };
    }

    // Включить/выключить mock режим
    setMockMode(enabled: boolean) {
        this.mockMode = enabled;
        console.log(`[TestRunner] Mock mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

#### 2.2 Создать REST API

**/src/test-runner/api.ts**:

```typescript
import express from 'express';
import { TestRunnerEngine } from './engine';
import db from '../utils/db';

const router = express.Router();

// GET /api/test/scenarios - список сценариев
router.get('/scenarios', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                scenario_id,
                COUNT(*) as steps_count,
                MIN(created_at) as created_at
            FROM test_dialogs
            GROUP BY scenario_id
            ORDER BY created_at DESC
        `);

        res.json({ scenarios: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/test/run/:scenario_id - запустить тест
router.post('/run/:scenario_id', async (req, res) => {
    const { scenario_id } = req.params;

    try {
        const engine = new TestRunnerEngine();

        // По умолчанию mock mode включен
        // Позже можно передавать через query param: ?mock=false
        const mockMode = req.query.mock !== 'false';
        engine.setMockMode(mockMode);

        res.json({
            status: 'started',
            scenario_id,
            mock_mode: mockMode,
            message: 'Test started. Poll /api/test/runs/:scenario_id for results'
        });

        // Запускаем асинхронно
        engine.runScenario(scenario_id).catch(console.error);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/test/runs/:scenario_id - получить результаты
router.get('/runs/:scenario_id', async (req, res) => {
    const { scenario_id } = req.params;

    try {
        const result = await db.query(`
            SELECT
                tr.step,
                td.user_query,
                tr.status,
                tr.final_answer,
                tr.validation_result,
                tr.error_message,
                tr.created_at,
                tr.completed_at
            FROM test_runs tr
            JOIN test_dialogs td ON tr.scenario_id = td.scenario_id AND tr.step = td.step
            WHERE tr.scenario_id = $1
            ORDER BY tr.step
        `, [scenario_id]);

        res.json({ runs: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
```

#### 2.3 Создать Frontend UI

**/public/test-runner/index.html**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Test Runner - MaaS MVP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            max-width: 1400px;
            margin: 0 auto;
            padding: 30px;
            background: #0a0a0a;
            color: #00ff00;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #00ff00;
        }
        h1 {
            font-size: 28px;
            letter-spacing: 2px;
        }
        .status {
            font-size: 14px;
            padding: 8px 16px;
            background: #1a1a1a;
            border: 1px solid #00ff00;
        }
        .scenarios {
            margin-bottom: 30px;
        }
        .scenarios h3 {
            margin-bottom: 15px;
            color: #00ff00;
        }
        .scenario-btn {
            padding: 12px 24px;
            margin: 5px;
            background: #1a1a1a;
            color: #00ff00;
            border: 2px solid #00ff00;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            transition: all 0.3s;
        }
        .scenario-btn:hover {
            background: #00ff00;
            color: #0a0a0a;
        }
        .scenario-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            background: #1a1a1a;
        }
        th, td {
            border: 1px solid #00ff00;
            padding: 12px;
            text-align: left;
        }
        th {
            background: #003300;
            color: #00ff00;
            font-weight: bold;
        }
        tr:hover td {
            background: #002200;
        }
        .status-badge {
            padding: 4px 12px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: bold;
            display: inline-block;
        }
        .status-badge.pending { background: #333; color: #999; }
        .status-badge.running { background: #004488; color: #00aaff; }
        .status-badge.passed { background: #004400; color: #00ff00; }
        .status-badge.failed { background: #440000; color: #ff0000; }
        .status-badge.error { background: #443300; color: #ffaa00; }
        .answer {
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .answer:hover {
            overflow: visible;
            white-space: normal;
        }
        .validation {
            font-size: 12px;
        }
        .validation.pass { color: #00ff00; }
        .validation.fail { color: #ff0000; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 TEST RUNNER</h1>
        <div class="status" id="status">READY</div>
    </div>

    <div class="scenarios">
        <h3>▸ Available Test Scenarios</h3>
        <div id="scenario-buttons">Loading...</div>
    </div>

    <div>
        <h3>▸ Inference Results</h3>
        <table>
            <thead>
                <tr>
                    <th style="width: 60px;">STEP</th>
                    <th>USER QUERY</th>
                    <th style="width: 100px;">STATUS</th>
                    <th>FINAL ANSWER</th>
                    <th style="width: 150px;">VALIDATION</th>
                </tr>
            </thead>
            <tbody id="results">
                <tr>
                    <td colspan="5" style="text-align: center; color: #666;">
                        No test runs yet. Select a scenario above.
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <script>
        let currentScenarioId = null;
        let pollInterval = null;

        async function loadScenarios() {
            const res = await fetch('/api/test/scenarios');
            const data = await res.json();

            const container = document.getElementById('scenario-buttons');
            if (data.scenarios.length === 0) {
                container.innerHTML = '<div style="color: #999;">No scenarios found</div>';
                return;
            }

            container.innerHTML = data.scenarios.map(s => `
                <button class="scenario-btn" onclick="runScenario('${s.scenario_id}')">
                    SCENARIO ${s.scenario_id.substr(0, 8)}... (${s.steps_count} steps)
                </button>
            `).join('');
        }

        async function runScenario(scenarioId) {
            currentScenarioId = scenarioId;
            updateStatus('RUNNING');

            document.getElementById('results').innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #00aaff;">
                        🚀 Launching test scenario...
                    </td>
                </tr>
            `;

            // Запускаем тест (mock mode by default)
            await fetch(`/api/test/run/${scenarioId}`, { method: 'POST' });

            // Начинаем polling
            startPolling(scenarioId);
        }

        function startPolling(scenarioId) {
            if (pollInterval) clearInterval(pollInterval);

            pollInterval = setInterval(async () => {
                const res = await fetch(`/api/test/runs/${scenarioId}`);
                const data = await res.json();

                if (data.runs.length > 0) {
                    updateTable(data.runs);

                    // Проверяем завершение
                    const allDone = data.runs.every(r =>
                        ['PASSED', 'FAILED', 'ERROR'].includes(r.status)
                    );

                    if (allDone) {
                        clearInterval(pollInterval);
                        const passed = data.runs.filter(r => r.status === 'PASSED').length;
                        const total = data.runs.length;
                        updateStatus(`COMPLETED (${passed}/${total} passed)`);
                    }
                }
            }, 1000);
        }

        function updateTable(runs) {
            const tbody = document.getElementById('results');
            tbody.innerHTML = runs.map(r => {
                const validationHtml = r.validation_result
                    ? (r.validation_result.passed
                        ? `<span class="validation pass">✓ PASS</span>`
                        : `<span class="validation fail">✗ ${r.validation_result.reason || 'FAIL'}</span>`)
                    : '-';

                return `
                    <tr>
                        <td>${r.step}</td>
                        <td>${r.user_query}</td>
                        <td>
                            <span class="status-badge ${r.status.toLowerCase()}">
                                ${r.status}
                            </span>
                        </td>
                        <td class="answer">
                            ${r.final_answer || '<span style="color: #666;">waiting...</span>'}
                        </td>
                        <td>${validationHtml}</td>
                    </tr>
                `;
            }).join('');
        }

        function updateStatus(text) {
            document.getElementById('status').textContent = text;
        }

        // Загрузка при старте
        loadScenarios();
    </script>
</body>
</html>
```

#### 2.4 Интегрировать в основной сервер

**/src/server.ts**:

```typescript
import express from 'express';
import path from 'path';
import cors from 'cors';
import testRunnerRoutes from './test-runner/api';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Test Runner API
app.use('/api/test', testRunnerRoutes);

// Test Runner UI
app.get('/test-runner', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/test-runner/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 MaaS MVP Server');
    console.log(`🌐 API:          http://localhost:${PORT}`);
    console.log(`🧪 Test Runner: http://localhost:${PORT}/test-runner`);
});
```

### Критерий успеха

- [ ] Запустить сервер: `npm run dev:server`
- [ ] Открыть в браузере: `http://localhost:3000/test-runner`
- [ ] Видим список сценариев (3 кнопки)
- [ ] Нажимаем "SCENARIO 00000000..." (первый сценарий)
- [ ] Видим прогресс в таблице:
  - Step 1: RUNNING → PASSED (mock ответ)
  - Step 2: RUNNING → PASSED
  - Step 3: RUNNING → PASSED
- [ ] Статус вверху: "COMPLETED (3/3 passed)"
- [ ] В таблице test_runs есть записи
- [ ] Mock ответы содержат текст: "Mock response to: ..."

### Время оценка
**4-6 часов**

---

## Шаг 3: Orchestrator

### Цель
Создать Orchestrator, который слушает события NOTIFY и маршрутизирует задачи к агентам.

### Задачи

#### 3.1 Создать Orchestrator

**/src/modules/orchestrator.ts**:

```typescript
import { Client } from 'pg';
import db from '../utils/db';

interface PipelineEvent {
    id: string;
    status: string;
    operation: string;
}

export class Orchestrator {
    private client: Client | null = null;

    async start() {
        this.client = await db.getClient();

        await this.client.query('LISTEN pipeline_events');
        console.log('📡 [Orchestrator] Listening for pipeline events...');

        this.client.on('notification', async (msg) => {
            if (!msg.payload) return;

            const event: PipelineEvent = JSON.parse(msg.payload);
            console.log(`🔔 [Orchestrator] Event:`, event);

            await this.handleEvent(event);
        });

        this.client.on('error', (err) => {
            console.error('❌ [Orchestrator] DB error:', err);
            this.reconnect();
        });
    }

    private async handleEvent(event: PipelineEvent) {
        const { id, status } = event;

        try {
            switch (status) {
                case 'NEW':
                    console.log(`➡️  [Orchestrator] Routing to Analyzer: ${id}`);
                    // await runAnalyzer(id);  // Пока комментарий
                    break;
                case 'ANALYZED':
                    console.log(`➡️  [Orchestrator] Routing to Assembler: ${id}`);
                    // await runAssembler(id);
                    break;
                case 'READY':
                    console.log(`➡️  [Orchestrator] Routing to FinalResponder: ${id}`);
                    // await runFinalResponder(id);
                    break;
                case 'COMPLETED':
                    console.log(`✅ [Orchestrator] Request completed: ${id}`);
                    break;
                case 'FAILED':
                    console.log(`❌ [Orchestrator] Request failed: ${id}`);
                    break;
                default:
                    console.log(`⏭️  [Orchestrator] Ignoring status: ${status}`);
            }
        } catch (error) {
            console.error(`[Orchestrator] Error handling event:`, error);
        }
    }

    private async reconnect() {
        console.log('🔄 [Orchestrator] Reconnecting...');
        setTimeout(() => this.start(), 5000);
    }

    async stop() {
        if (this.client) {
            await this.client.query('UNLISTEN pipeline_events');
            this.client.release();
        }
    }
}
```

#### 3.2 Создать entry point

**/src/main.ts**:

```typescript
import { Orchestrator } from './modules/orchestrator';

async function main() {
    console.log('🚀 Starting MaaS Orchestrator...\n');

    const orchestrator = new Orchestrator();
    await orchestrator.start();

    process.on('SIGINT', async () => {
        console.log('\n👋 Shutting down...');
        await orchestrator.stop();
        process.exit(0);
    });
}

main().catch(console.error);
```

### Критерий успеха через Test Runner

- [ ] Запустить Orchestrator: `npm run dev`
- [ ] Запустить Server: `npm run dev:server` (в другом терминале)
- [ ] Открыть Test Runner UI
- [ ] Запустить сценарий
- [ ] В консоли Orchestrator видим:
  ```
  🔔 Event: { id: '...', status: 'NEW', ... }
  ➡️  Routing to Analyzer: ...
  ```
- [ ] Test Runner все еще использует mock mode
- [ ] Тесты проходят (потому что mock не требует реального pipeline)

### Время оценка
**2-3 часа**

---

## Шаг 4: Agent Stubs (заглушки)

### Цель
Создать заглушки агентов, которые просто меняют статусы. Это проверит весь цикл статусов.

### Задачи

#### 4.1 Создать agent stubs

**/src/modules/agents.ts**:

```typescript
import db from '../utils/db';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runAnalyzer(id: string) {
    console.log(`[Analyzer] Starting for ${id}`);

    // Идемпотентный захват
    const result = await db.query(`
        UPDATE pipeline_runs
        SET status = 'ANALYZING', updated_at = NOW()
        WHERE id = $1 AND status = 'NEW'
        RETURNING *
    `, [id]);

    if (result.rowCount === 0) {
        console.log(`[Analyzer] Task ${id} already taken`);
        return;
    }

    await sleep(500);

    // Фиктивный анализ
    const fakeAnalysis = {
        needs_context: false,
        context_type: 'GENERAL',
        time_scope: null,
        search_keywords: [],
        context_found: null
    };

    await db.query(`
        UPDATE pipeline_runs
        SET
            analysis_result = $1,
            status = 'ANALYZED',
            updated_at = NOW()
        WHERE id = $2
    `, [JSON.stringify(fakeAnalysis), id]);

    console.log(`[Analyzer] ✅ Completed for ${id}`);
}

export async function runAssembler(id: string) {
    console.log(`[Assembler] Starting for ${id}`);

    const result = await db.query(`
        UPDATE pipeline_runs
        SET status = 'ASSEMBLING', updated_at = NOW()
        WHERE id = $1 AND status = 'ANALYZED'
        RETURNING *
    `, [id]);

    if (result.rowCount === 0) return;

    await sleep(300);

    const fakeContext = '<system>You are a helpful assistant</system>\n<query>User query here</query>';

    await db.query(`
        UPDATE pipeline_runs
        SET
            final_context_payload = $1,
            status = 'READY',
            updated_at = NOW()
        WHERE id = $2
    `, [fakeContext, id]);

    console.log(`[Assembler] ✅ Completed for ${id}`);
}

export async function runFinalResponder(id: string) {
    console.log(`[FinalResponder] Starting for ${id}`);

    const result = await db.query(`
        UPDATE pipeline_runs
        SET status = 'RESPONDING', updated_at = NOW()
        WHERE id = $1 AND status = 'READY'
        RETURNING *
    `, [id]);

    if (result.rowCount === 0) return;

    await sleep(1000);

    // Фиктивный ответ
    const task = result.rows[0];
    const fakeAnswer = `Stub response to: "${task.user_query}"`;

    await db.query(`
        UPDATE pipeline_runs
        SET
            final_answer = $1,
            status = 'COMPLETED',
            updated_at = NOW()
        WHERE id = $2
    `, [fakeAnswer, id]);

    console.log(`[FinalResponder] ✅ Completed for ${id}`);
}
```

#### 4.2 Подключить к Orchestrator

Обновить **/src/modules/orchestrator.ts**:

```typescript
import { runAnalyzer, runAssembler, runFinalResponder } from './agents';

// В handleEvent:
case 'NEW':
    await runAnalyzer(id);
    break;
case 'ANALYZED':
    await runAssembler(id);
    break;
case 'READY':
    await runFinalResponder(id);
    break;
```

#### 4.3 Отключить mock в Test Runner

В **/src/test-runner/api.ts**:

```typescript
// POST /api/test/run/:scenario_id
// Изменить:
const mockMode = false; // Отключаем mock, используем реальный pipeline
engine.setMockMode(mockMode);
```

### Критерий успеха через Test Runner

- [ ] Запустить Orchestrator + Server
- [ ] Запустить сценарий в Test Runner
- [ ] Видим в консоли полный цикл:
  ```
  [Orchestrator] Routing to Analyzer
  [Analyzer] Starting... ✅ Completed
  [Orchestrator] Routing to Assembler
  [Assembler] Starting... ✅ Completed
  [Orchestrator] Routing to FinalResponder
  [FinalResponder] Starting... ✅ Completed
  ```
- [ ] В Test Runner UI видим:
  - Все шаги PASSED
  - Final answers: "Stub response to: ..."
- [ ] В pipeline_runs записи имеют status='COMPLETED'

### Время оценка
**3-4 часа**

---

## Последующие шаги (краткое описание)

### Шаг 5: Logger v1
Добавляем запись в raw_logs. Тест: проверяем что записи появляются.

### Шаг 6: Analyzer v1 (реальный)
Заменяем stub на реальный вызов OpenAI. Тест: видим реальный анализ в analysis_result.

### Шаг 7: Assembler v1 (реальный)
Собираем реальный контекст. Тест: видим правильную структуру в final_context_payload.

### Шаг 8: Final Responder v1 (реальный)
Вызываем OpenAI для финального ответа. Тест: видим качественный ответ в Test Runner.

### Шаг 9: Archivist v1
Перерабатываем raw_logs в LSM. Тест: после прогона проверяем lsm_storage.

### Шаг 10: Assembler v2 (с LSM)
Подключаем чтение из LSM. Тест: сценарий с упоминанием прошлого → видим контекст.

### Шаг 11: Полировка
Retry логика, метрики, cleanup. Тест: все сценарии проходят стабильно.

---

## Итоговая оценка времени

---

## Phase 4: Frontend Integration (Post-MVP)

> **Примечание**: Эта фаза выполняется ПОСЛЕ завершения MVP (шаги 0-11). MVP - это чисто backend система. Фронтенд добавляется как отдельный модуль.

### Цель
Создать полноценный пользовательский интерфейс с аутентификацией, real-time обновлениями и удобным UX.

### Архитектура фронтенда

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

### Шаг 12: Frontend Setup

**Цель**: Создать базовую структуру React приложения с Supabase SDK.

**Задачи**:
1. Инициализировать React + Vite проект
2. Установить `@supabase/supabase-js`, `@supabase/auth-ui-react`
3. Настроить Supabase client (SUPABASE_URL + ANON_KEY)
4. Создать базовый routing (React Router)
5. Добавить layout компоненты

**Критерии успеха**:
- [ ] React app стартует на http://localhost:5173
- [ ] Supabase client инициализирован
- [ ] Routing работает (/, /login, /chat)

**Время**: 2-3 часа

---

### Шаг 13: Authentication UI

**Цель**: Добавить систему аутентификации (email + password).

**Задачи**:
1. Создать Login/Signup компоненты
2. Использовать Supabase Auth UI
3. Настроить protected routes
4. Добавить auth context/provider
5. Создать user profile страницу

**Критерии успеха**:
- [ ] Пользователь может зарегистрироваться
- [ ] Пользователь может войти/выйти
- [ ] Protected routes работают
- [ ] User ID передаётся в backend запросы

**Время**: 3-4 часа

---

### Шаг 14: Chat Interface

**Цель**: Создать интерфейс для диалога с AI Mentor.

**Задачи**:
1. Создать chat UI компонент (message list + input)
2. Подключить к backend API (POST /api/query)
3. Отображать статусы (typing, analyzing, thinking)
4. Добавить markdown rendering для ответов
5. Реализовать scroll to bottom

**Критерии успеха**:
- [ ] Пользователь может отправить вопрос
- [ ] Видны статусы обработки
- [ ] Ответы отображаются с форматированием
- [ ] История сохраняется

**Время**: 4-6 часов

---

### Шаг 15: Realtime Updates

**Цель**: Добавить live обновления статуса запроса через Supabase Realtime.

**Задачи**:
1. Подписаться на изменения в `pipeline_runs` через Supabase Realtime
2. Обновлять UI когда статус меняется (NEW → ANALYZING → ANALYZED...)
3. Показывать live индикаторы
4. Обработать connection errors

**Критерии успеха**:
- [ ] UI обновляется в реальном времени
- [ ] Видны все этапы обработки (Analyzing → Assembling → Responding)
- [ ] Нет polling на клиенте

**Время**: 3-4 часа

---

### Шаг 16: History & Search

**Цель**: Добавить просмотр истории диалогов и поиск.

**Задачи**:
1. Создать History sidebar компонент
2. Загружать прошлые диалоги из `pipeline_runs`
3. Добавить поиск по истории
4. Группировать по датам (сегодня, вчера, эта неделя...)
5. Infinite scroll для старых диалогов

**Критерии успеха**:
- [ ] Пользователь видит историю запросов
- [ ] Может кликнуть на старый диалог и просмотреть
- [ ] Поиск работает
- [ ] Загрузка по мере скролла

**Время**: 4-5 часов

---

### Шаг 17: Admin Panel

**Цель**: Создать админ панель для мониторинга системы.

**Задачи**:
1. Создать admin-only роут
2. Dashboard с метриками (requests/day, avg time, errors)
3. Просмотр всех pipeline runs (admin table)
4. Управление system_prompts (edit промптов)
5. Просмотр LSM storage

**Критерии успеха**:
- [ ] Админы могут видеть все запросы
- [ ] Можно редактировать промпты без деплоя
- [ ] Метрики отображаются
- [ ] RLS настроен (админы видят всё, юзеры - только своё)

**Время**: 5-6 часов

---

### Шаг 18: Polish & Deploy

**Цель**: Финальная полировка UI/UX и деплой.

**Задачи**:
1. Добавить loading states везде
2. Error boundaries
3. Toast notifications
4. Responsive design (mobile)
5. Dark mode support
6. Deploy на Vercel/Netlify
7. Connect production Supabase

**Критерии успеха**:
- [ ] App работает на мобильных
- [ ] Все ошибки обрабатываются gracefully
- [ ] Production deploy успешен
- [ ] SSL сертификат настроен

**Время**: 6-8 часов

---

## Итоговая таблица времени

### MVP (Backend Only)
| Шаг | Описание | Время |
|-----|----------|-------|
| 0 | Подготовка | 1-2 ч |
| 1 | База данных | 2-3 ч |
| 2 | **Test Runner** | **4-6 ч** |
| 3 | Orchestrator | 2-3 ч |
| 4 | Agent Stubs | 3-4 ч |
| 5 | Logger | 1-2 ч |
| 6 | Analyzer (real) | 4-6 ч |
| 7 | Assembler (real) | 2-3 ч |
| 8 | Final Responder (real) | 3-4 ч |
| 9 | Archivist | 4-6 ч |
| 10 | Assembler v2 | 2-3 ч |
| 11 | Полировка | 4-6 ч |
| **Итого MVP** | | **32-48 часов** |

### Frontend Integration (Post-MVP)
| Шаг | Описание | Время |
|-----|----------|-------|
| 12 | Frontend Setup | 2-3 ч |
| 13 | Authentication UI | 3-4 ч |
| 14 | Chat Interface | 4-6 ч |
| 15 | Realtime Updates | 3-4 ч |
| 16 | History & Search | 4-5 ч |
| 17 | Admin Panel | 5-6 ч |
| 18 | Polish & Deploy | 6-8 ч |
| **Итого Frontend** | | **27-36 часов** |

### Grand Total
| Фаза | Время |
|------|-------|
| MVP (Backend) | 32-48 ч |
| Frontend | 27-36 ч |
| **ИТОГО** | **59-84 часа** |

---

## Credentials Configuration

### MVP (только backend)
```env
DATABASE_URL=postgresql://...    # Прямой PostgreSQL доступ
OPENAI_API_KEY=sk-proj-...       # LLM запросы
```

### Full App (backend + frontend)
```env
# Backend (.env)
DATABASE_URL=postgresql://...    # Backend использует
OPENAI_API_KEY=sk-proj-...

# Frontend (.env.local)
VITE_SUPABASE_URL=https://...    # Frontend использует
VITE_SUPABASE_ANON_KEY=eyJ...    # Frontend использует
```

**Почему разные:**
- Backend нужен LISTEN/NOTIFY → DATABASE_URL
- Frontend нужен Auth/Realtime/RLS → Supabase SDK

---

**Версия документа**: 3.0 (added Frontend Integration phase)
**Дата**: 2025-11-25
**Статус**: MVP готов к реализации, Frontend - roadmap
