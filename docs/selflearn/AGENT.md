# AGENT — Mission Controller

> **Ключевая идея:** Self-Learning System — это полноценный **Агент** с миссией, целями и внутренним проектом обучения.

---

## 0. Определение

**Agent (Mission Controller)** — это верхний уровень абстракции системы самообучения, который:

* **Принимает миссию** от пользователя через UI/API
* **Переводит цели** в формальные learning campaigns
* **Управляет суб-агентами** (Manager, Analyst, Teacher)
* **Принимает стратегические решения** (продолжать/остановить/эскалировать)
* **Отчитывается пользователю** о прогрессе и результатах

Agent **НЕ** выполняет низкоуровневые операции — это задача суб-агентов.

---

## 0.1. Двухуровневая архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
│                                │                                         │
│                    mission, goals, constraints                           │
│                                │                                         │
│                                ▼                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                          AGENT LEVEL                                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    AGENT (Mission Controller)                     │   │
│  │                                                                   │   │
│  │  mission: "Довести MaaS до production quality"                   │   │
│  │  campaigns: [campaign_001, campaign_002, ...]                    │   │
│  │  state: { overall_progress, decisions_log, reports }             │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                │                                         │
│                         spawn / control                                  │
│                                │                                         │
├────────────────────────────────┼────────────────────────────────────────┤
│                          SUB-AGENT LEVEL                                 │
│                                │                                         │
│         ┌──────────────────────┼──────────────────────┐                 │
│         ▼                      ▼                      ▼                 │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐           │
│  │  MANAGER    │       │  ANALYST    │       │  TEACHER    │           │
│  │  (cycles)   │       │  (metrics)  │       │  (hypotheses│           │
│  └─────────────┘       └─────────────┘       └─────────────┘           │
│         │                                           │                   │
│         ▼                                           ▼                   │
│  ┌─────────────┐                            ┌─────────────┐            │
│  │  EMULATOR   │                            │   TUNER     │            │
│  └─────────────┘                            └─────────────┘            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                          SERVICE LEVEL                                   │
│                                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │  Sensor   │  │   MaaS    │  │    DB     │  │  LLM API  │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Сущности Agent Level

### 1.1. Mission (Миссия)

Миссия — это высокоуровневое описание того, чего хочет достичь пользователь.

```typescript
interface Mission {
  id: UUID;
  created_at: Date;
  created_by: string;  // user_id

  // Описание миссии
  title: string;                    // "Довести MaaS до production quality"
  description: string;              // Развёрнутое описание
  success_criteria: string;         // "Все primary metrics в пределах targets"

  // Глобальные цели
  targets: TargetMetric[];          // [{metric: 'precision', target: 0.85}, ...]

  // Глобальные ограничения
  constraints: Constraint[];        // [{metric: 'latency_p95', max: 5000}, ...]

  // Параметры исполнения
  max_campaigns: number;            // Макс количество campaigns
  max_cycles_per_campaign: number;  // Макс циклов в одной campaign
  autonomy_level: AutonomyLevel;    // 'full_auto' | 'semi_auto' | 'manual'

  // Состояние
  status: MissionStatus;            // 'active' | 'completed' | 'paused' | 'failed'
  progress_percent: number;         // 0-100
}

type MissionStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
```

### 1.2. Campaign (Кампания обучения)

Campaign — это конкретная попытка достичь subset целей миссии.

```typescript
interface Campaign {
  id: UUID;
  mission_id: UUID;
  created_at: Date;

  // Фокус кампании
  name: string;                     // "Optimize Precision"
  focus_metrics: string[];          // ['precision', 'recall']
  allowed_impacts: string[];        // Какие импакты можно менять

  // Targets для этой кампании (subset миссии)
  targets: TargetMetric[];
  constraints: Constraint[];

  // Состояние
  status: CampaignStatus;
  current_cycle: number;
  max_cycles: number;

  // Результаты
  metrics_history: MetricsSnapshot[];
  best_metrics: MetricsSnapshot;
  total_improvements: Record<string, number>;  // {precision: +0.15, recall: -0.02}

  // Связь с Manager
  manager_state: ManagerState;
}

type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused';
```

### 1.3. TargetMetric (Целевая метрика)

```typescript
interface TargetMetric {
  metric: string;                   // 'precision', 'recall', etc.
  target: number;                   // 0.85
  direction: 'min' | 'max';         // 'max' = больше лучше, 'min' = меньше лучше
  priority: 'critical' | 'primary' | 'secondary';
  threshold: number;                // gap > threshold → требует внимания
}
```

### 1.4. Constraint (Ограничение)

```typescript
interface Constraint {
  type: 'metric' | 'resource' | 'time' | 'autonomy';

  // Для metric constraints
  metric?: string;
  min?: number;
  max?: number;

  // Для resource constraints
  max_cost_per_cycle?: number;      // $ за цикл
  max_total_cost?: number;          // $ всего

  // Для time constraints
  max_duration_hours?: number;

  // Для autonomy constraints
  requires_approval?: string[];     // Какие действия требуют одобрения
}
```

### 1.5. AutonomyLevel (Уровень автономии)

```typescript
type AutonomyLevel = 'full_auto' | 'semi_auto' | 'manual';

const AUTONOMY_RULES: Record<AutonomyLevel, AutonomyRules> = {
  'full_auto': {
    can_start_campaign: true,
    can_apply_changes: true,
    can_rollback: true,
    requires_approval: []
  },
  'semi_auto': {
    can_start_campaign: true,
    can_apply_changes: false,  // Требует approval
    can_rollback: true,        // Откат автоматический
    requires_approval: ['apply_changes', 'stop_campaign']
  },
  'manual': {
    can_start_campaign: false,
    can_apply_changes: false,
    can_rollback: false,
    requires_approval: ['start_campaign', 'apply_changes', 'rollback', 'stop_campaign']
  }
};
```

### 1.6. AgentState (Состояние агента)

```typescript
interface AgentState {
  mission: Mission;
  campaigns: Campaign[];
  active_campaign_id: UUID | null;

  // Общий прогресс
  overall_metrics: MetricsSnapshot;
  metrics_trend: 'improving' | 'stable' | 'degrading';

  // История решений
  decisions_log: Decision[];

  // Pending approvals (для semi_auto/manual)
  pending_approvals: ApprovalRequest[];
}

interface Decision {
  id: UUID;
  timestamp: Date;
  type: 'start_campaign' | 'stop_campaign' | 'approve_change' | 'reject_change' | 'escalate';
  reason: string;
  context: any;
  outcome: string;
}
```

---

## 2. Зона ответственности Agent

### 2.1. Что делает Agent

1. **Принимает миссию от пользователя:**
   * Парсит natural language описание
   * Извлекает targets, constraints, autonomy level
   * Создаёт Mission record

2. **Планирует campaigns:**
   * Разбивает миссию на фокусные кампании
   * Определяет приоритет и порядок
   * Аллоцирует ресурсы (циклы, бюджет)

3. **Запускает и управляет Manager'ом:**
   * Spawn Manager для активной campaign
   * Передаёт targets и constraints
   * Мониторит прогресс

4. **Принимает стратегические решения:**
   * Продолжать campaign или остановить?
   * Переключиться на другую campaign?
   * Эскалировать пользователю?

5. **Отчитывается пользователю:**
   * Progress reports
   * Milestone достижения
   * Запросы на approval (для semi_auto/manual)

### 2.2. Чего Agent НЕ делает

* **Не** координирует циклы — это Manager
* **Не** вычисляет метрики — это Analyst
* **Не** генерирует гипотезы — это Teacher
* **Не** применяет изменения — это Tuner
* **Не** генерирует диалоги — это Emulator

---

## 3. Входы и выходы

### 3.1. Входы от пользователя

```typescript
interface UserInput {
  // Создание миссии
  create_mission: {
    title: string;
    description: string;
    targets: TargetMetric[];
    constraints?: Constraint[];
    autonomy_level?: AutonomyLevel;
  };

  // Управление
  pause_mission: { mission_id: UUID };
  resume_mission: { mission_id: UUID };
  cancel_mission: { mission_id: UUID };

  // Approval responses
  approve: { request_id: UUID };
  reject: { request_id: UUID; reason: string };
}
```

### 3.2. Выходы к пользователю

```typescript
interface AgentOutput {
  // Reports
  progress_report: {
    mission_id: UUID;
    progress_percent: number;
    current_metrics: MetricsSnapshot;
    improvements: Record<string, number>;
    campaigns_completed: number;
    campaigns_total: number;
  };

  // Approval requests
  approval_request: {
    id: UUID;
    type: string;
    description: string;
    impact: string;
    recommended_action: 'approve' | 'reject';
    context: any;
  };

  // Notifications
  milestone_reached: { metric: string; value: number; target: number };
  mission_completed: { summary: MissionSummary };
  issue_detected: { severity: string; description: string };
}
```

### 3.3. Выходы к Manager (Sub-Agent)

```typescript
interface AgentToManager {
  // Запуск campaign
  start_campaign: {
    campaign_id: UUID;
    targets: TargetMetric[];
    constraints: Constraint[];
    max_cycles: number;
    allowed_impacts: string[];
  };

  // Управление
  pause_campaign: { campaign_id: UUID };
  resume_campaign: { campaign_id: UUID };
  stop_campaign: { campaign_id: UUID; reason: string };
}
```

### 3.4. Входы от Manager

```typescript
interface ManagerToAgent {
  // Отчёты
  cycle_completed: {
    campaign_id: UUID;
    cycle_number: number;
    metrics: MetricsSnapshot;
    changes_applied: ParameterChange[];
  };

  // Статусы
  campaign_completed: {
    campaign_id: UUID;
    final_metrics: MetricsSnapshot;
    total_improvements: Record<string, number>;
  };

  // Запросы
  approval_needed: {
    campaign_id: UUID;
    action: string;
    context: any;
  };

  // Проблемы
  issue_detected: {
    campaign_id: UUID;
    severity: 'warning' | 'error' | 'critical';
    description: string;
  };
}
```

---

## 4. Внутренняя логика Agent

### 4.1. Mission Planner

Разбивает миссию на campaigns:

```typescript
function planCampaigns(mission: Mission): Campaign[] {
  const campaigns: Campaign[] = [];

  // Группируем targets по связанным метрикам
  const metricGroups = groupRelatedMetrics(mission.targets);

  // Создаём campaign для каждой группы
  for (const group of metricGroups) {
    campaigns.push({
      name: `Optimize ${group.primary_metric}`,
      focus_metrics: group.metrics,
      targets: group.targets,
      allowed_impacts: getRelatedImpacts(group.metrics),
      max_cycles: Math.floor(mission.max_cycles_per_campaign / metricGroups.length)
    });
  }

  // Сортируем по приоритету
  return campaigns.sort((a, b) => priorityScore(b) - priorityScore(a));
}
```

### 4.2. Strategic Decision Engine

Принимает решения на мета-уровне:

```typescript
interface StrategicDecision {
  action: 'continue' | 'stop' | 'switch_campaign' | 'escalate';
  reason: string;
}

function makeStrategicDecision(state: AgentState): StrategicDecision {
  const campaign = getActiveCampaign(state);
  const metrics = campaign.metrics_history;

  // 1. Проверка достижения targets
  if (allTargetsMet(metrics.last, campaign.targets)) {
    return { action: 'stop', reason: 'All targets met' };
  }

  // 2. Проверка лимита циклов
  if (campaign.current_cycle >= campaign.max_cycles) {
    return { action: 'switch_campaign', reason: 'Max cycles reached' };
  }

  // 3. Проверка тренда
  const trend = computeTrend(metrics, 5);  // последние 5 циклов
  if (trend === 'degrading') {
    return { action: 'escalate', reason: 'Metrics degrading despite tuning' };
  }

  // 4. Проверка plateau
  if (isPlateaued(metrics, 3)) {  // нет улучшений 3 цикла
    // Может попробовать другую campaign
    if (hasOtherCampaigns(state)) {
      return { action: 'switch_campaign', reason: 'Plateau detected' };
    }
    return { action: 'escalate', reason: 'Optimization plateau' };
  }

  return { action: 'continue', reason: 'Progress ongoing' };
}
```

### 4.3. Approval Manager

Управляет запросами на одобрение:

```typescript
interface ApprovalRequest {
  id: UUID;
  type: 'apply_changes' | 'stop_campaign' | 'start_campaign';
  description: string;
  impact: string;
  expires_at: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

function handleApproval(
  request: ApprovalRequest,
  response: 'approve' | 'reject',
  state: AgentState
): void {
  if (response === 'approve') {
    executeAction(request, state);
    logDecision(state, 'approve', request);
  } else {
    rollbackPendingAction(request, state);
    logDecision(state, 'reject', request);
  }
}
```

---

## 5. Жизненный цикл

```
1. User создаёт Mission
       ↓
2. Agent парсит миссию
   • Извлекает targets, constraints
   • Планирует campaigns
       ↓
3. Agent запускает первую Campaign
   • Spawn Manager с parameters
       ↓
4. Manager выполняет циклы
   • Emulator → Analyst → Teacher → Tuner
   • Отчитывается Agent'у после каждого цикла
       ↓
5. Agent принимает стратегическое решение
   • Continue / Stop / Switch / Escalate
       ↓
6. Если continue → goto 4
   Если stop → завершить campaign
   Если switch → запустить следующую campaign
   Если escalate → уведомить пользователя
       ↓
7. После всех campaigns → Mission завершена
   • Финальный отчёт пользователю
```

---

## 6. Таблицы БД

### 6.1. missions

```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  title TEXT NOT NULL,
  description TEXT,
  success_criteria TEXT,

  targets JSONB NOT NULL,        -- TargetMetric[]
  constraints JSONB,             -- Constraint[]

  max_campaigns INTEGER DEFAULT 5,
  max_cycles_per_campaign INTEGER DEFAULT 20,
  autonomy_level TEXT DEFAULT 'semi_auto',

  status TEXT DEFAULT 'draft',   -- MissionStatus
  progress_percent NUMERIC DEFAULT 0,

  completed_at TIMESTAMPTZ,
  final_summary JSONB
);
```

### 6.2. campaigns

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  focus_metrics TEXT[],
  allowed_impacts TEXT[],

  targets JSONB NOT NULL,
  constraints JSONB,

  status TEXT DEFAULT 'pending',
  current_cycle INTEGER DEFAULT 0,
  max_cycles INTEGER,

  metrics_history JSONB,         -- MetricsSnapshot[]
  best_metrics JSONB,
  total_improvements JSONB,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### 6.3. agent_decisions

```sql
CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  campaign_id UUID REFERENCES campaigns(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  decision_type TEXT NOT NULL,   -- 'start_campaign', 'stop_campaign', 'escalate', etc.
  reason TEXT NOT NULL,
  context JSONB,
  outcome TEXT
);
```

### 6.4. approval_requests

```sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id),
  campaign_id UUID REFERENCES campaigns(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  request_type TEXT NOT NULL,
  description TEXT NOT NULL,
  impact TEXT,
  context JSONB,

  status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'expired'
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_by TEXT
);
```

---

## 7. API Agent'а

### 7.1. Для пользователя (Frontend)

```typescript
// Создание миссии
POST /api/agent/missions
Body: CreateMissionRequest
Response: Mission

// Получение статуса
GET /api/agent/missions/:id
Response: MissionWithProgress

// Управление
POST /api/agent/missions/:id/pause
POST /api/agent/missions/:id/resume
POST /api/agent/missions/:id/cancel

// Approval
POST /api/agent/approvals/:id/approve
POST /api/agent/approvals/:id/reject
Body: { reason?: string }

// Reports
GET /api/agent/missions/:id/report
Response: MissionReport
```

### 7.2. Внутренний (для Manager)

```typescript
// Manager reports
POST /api/agent/internal/cycle-completed
Body: CycleCompletedEvent

POST /api/agent/internal/campaign-completed
Body: CampaignCompletedEvent

POST /api/agent/internal/approval-needed
Body: ApprovalNeededEvent

POST /api/agent/internal/issue-detected
Body: IssueDetectedEvent
```

---

## 8. Метрики качества Agent

| Метрика | Описание | Target |
|---------|----------|--------|
| **Mission Success Rate** | % миссий, достигших целей | > 70% |
| **Campaigns per Mission** | Среднее количество campaigns | < 3 |
| **Decision Accuracy** | % правильных стратегических решений | > 80% |
| **Time to Target** | Время от старта до достижения targets | < 48h |
| **Escalation Rate** | % ситуаций, требующих эскалации | < 20% |

---

## 9. Связь с другими компонентами

```
USER
  │
  │ mission, goals, approvals
  ▼
┌─────────────────────────────────────────┐
│                 AGENT                    │
│                                          │
│  missions, campaigns, decisions          │
│                                          │
└────────────────┬────────────────────────┘
                 │
                 │ start_campaign, stop_campaign
                 ▼
┌─────────────────────────────────────────┐
│               MANAGER                    │
│                                          │
│  cycles, coordination                    │
│                                          │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
ANALYST      TEACHER       EMULATOR
    │            │
    │            ▼
    │         TUNER
    │            │
    └────────────┴─────────► MaaS
```

---

*Последнее обновление: 2025-11-28*
