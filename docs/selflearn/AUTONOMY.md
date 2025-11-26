# Autonomy & Safety

> Что система может менять автоматически, а что требует подтверждения.

---

## Границы автономии

### Что система может менять АВТОМАТИЧЕСКИ

| Параметр | Диапазон | Условие |
|----------|----------|---------|
| `top_k` | 1-5 | precision/recall trade-off |
| `relevance_weight` | 0.3-0.7 | Не крайние значения |
| `recency_weight` | 0.3-0.7 | Не крайние значения |
| `keyword_count` | 3-7 | Постепенно |
| `temperature` | 0.5-0.9 | Для ответов |
| `prompt_version` | Только A/B tested | После статзначимости |

### Что требует РУЧНОГО подтверждения

| Изменение | Причина |
|-----------|---------|
| Смена модели (mini → 4o) | Стоимость ×10 |
| Включение pgvector | Архитектурное изменение |
| Изменение RLS политик | Безопасность |
| top_k > 5 | Риск деградации качества |
| Удаление memories | Необратимо |
| Изменение Archivist prompts | Влияет на долгосрочную память |

---

## Parameter Versioning

**Артефакт:** таблица `experiment_parameters`

```sql
CREATE TABLE experiment_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Versioning
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT FALSE,

  -- Parameter values (JSONB для гибкости)
  retrieval_params JSONB DEFAULT '{
    "top_k": 3,
    "keyword_count": 5,
    "relevance_weight": 0.5,
    "recency_weight": 0.5,
    "min_tag_overlap": 1
  }',

  context_params JSONB DEFAULT '{
    "max_tokens": 4000,
    "memory_order": "relevance",
    "include_metadata": true
  }',

  llm_params JSONB DEFAULT '{
    "model": "gpt-4o-mini",
    "temperature": 0.7
  }',

  archivist_params JSONB DEFAULT '{
    "max_tags": 5,
    "summary_length": "medium"
  }',

  -- Metadata
  change_reason TEXT,
  changed_by VARCHAR(50), -- 'auto' | 'manual' | experiment_id

  CONSTRAINT one_active UNIQUE (is_active) WHERE is_active = TRUE
);
```

### Функции управления версиями

```sql
-- Переключение на новую версию
CREATE OR REPLACE FUNCTION activate_parameter_version(target_version INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE experiment_parameters SET is_active = FALSE WHERE is_active = TRUE;
  UPDATE experiment_parameters SET is_active = TRUE WHERE version = target_version;
END;
$$ LANGUAGE plpgsql;

-- Откат к предыдущей версии
CREATE OR REPLACE FUNCTION rollback_parameters()
RETURNS void AS $$
DECLARE
  current_ver INTEGER;
  prev_ver INTEGER;
BEGIN
  SELECT version INTO current_ver FROM experiment_parameters WHERE is_active = TRUE;
  SELECT MAX(version) INTO prev_ver FROM experiment_parameters WHERE version < current_ver;
  PERFORM activate_parameter_version(prev_ver);
END;
$$ LANGUAGE plpgsql;
```

---

## Как Optimizer меняет параметры

**Артефакт:** функция в `[NEW] src/selflearn/optimizer.ts`

```typescript
async function updateParameter(
  param: string,
  newValue: any,
  reason: string
): Promise<void> {
  // 1. Создать новую версию
  const currentParams = await getCurrentParams();
  const newVersion = currentParams.version + 1;

  // 2. Обновить нужный параметр
  const updatedParams = {
    ...currentParams,
    [getParamCategory(param)]: {
      ...currentParams[getParamCategory(param)],
      [param]: newValue
    }
  };

  // 3. Сохранить
  await db.query(`
    INSERT INTO experiment_parameters (version, retrieval_params, ..., change_reason, changed_by)
    VALUES ($1, $2, ..., $3, 'auto')
  `, [newVersion, updatedParams.retrieval_params, reason]);

  // 4. Активировать
  await db.query(`SELECT activate_parameter_version($1)`, [newVersion]);

  logger.info(`[Optimizer] Updated ${param} to ${newValue}: ${reason}`);
}
```

---

## Защита от деградации (Auto-Rollback)

**Артефакт:** константы и функция в `[NEW] src/selflearn/optimizer.ts`

```typescript
const DEGRADATION_RULES = {
  // Если precision падает > 10% за 3 цикла — откат
  retrieval_precision: { threshold: -0.10, cycles: 3 },

  // Если hallucination растёт > 5% за 2 цикла — откат
  hallucination_rate: { threshold: +0.05, cycles: 2 },

  // Если latency P95 > 5s за 5 циклов — откат
  latency_p95: { threshold: 5000, cycles: 5 },

  // Если error_rate > 10% — немедленный откат
  error_rate: { threshold: 0.10, cycles: 1 },
};

async function checkDegradation(metrics: Metrics[]): Promise<boolean> {
  for (const [metric, rule] of Object.entries(DEGRADATION_RULES)) {
    const recentValues = metrics.slice(-rule.cycles).map(m => m[metric]);
    const baseline = await getBaselineMetric(metric);

    const degraded = recentValues.every(v =>
      isDegraded(v, baseline, rule.threshold)
    );

    if (degraded) {
      logger.error(`[Optimizer] DEGRADATION DETECTED: ${metric}`);
      await rollbackParameters();
      await alertAdmin(`Auto-rollback triggered: ${metric} degraded`);
      return true;
    }
  }
  return false;
}
```

---

## Safety & Isolation

### Правила для self-learning

1. **RLS всегда активна** — эксперименты не обходят Row-Level Security
2. **Метрика утечки = 0** — любое нарушение изоляции = критический alert
3. **Golden dataset изолирован** — тестовые данные не смешиваются с реальными
4. **Audit log** — все автоматические изменения логируются

### Isolation Test

```typescript
async function testTenantIsolation(): Promise<boolean> {
  const testUserA = 'test-user-a';
  const testUserB = 'test-user-b';

  // Создаём память для user A
  await createMemory(testUserA, 'Secret info for A');

  // Пытаемся получить её от имени user B
  const memoriesForB = await getMemories(testUserB, 'secret');

  // Должно быть 0
  if (memoriesForB.length > 0) {
    logger.error('[SECURITY] Tenant isolation FAILED!');
    await alertAdmin('CRITICAL: Memory leak between tenants');
    return false;
  }

  // Cleanup
  await deleteTestMemory(testUserA);

  return true;
}
```

### Обязательные проверки в каждом macro-cycle

```typescript
async function macroSecurityChecks(): Promise<void> {
  // 1. Tenant isolation
  const isolationOk = await testTenantIsolation();
  await logTelemetry({ isolation_ok: isolationOk });

  // 2. No PII in logs (sample check)
  const piiDetected = await scanLogsForPII();
  if (piiDetected) {
    await alertAdmin('PII detected in logs');
  }

  // 3. RLS policies active
  const rlsActive = await checkRLSEnabled();
  if (!rlsActive) {
    await alertAdmin('CRITICAL: RLS disabled');
  }
}
```

---

## Команды для агента

1. «Создай таблицу `experiment_parameters` по схеме выше.»
2. «Добавь функции `activate_parameter_version()` и `rollback_parameters()` в БД.»
3. «Реализуй `updateParameter()` в `src/selflearn/optimizer.ts`.»
4. «Добавь `checkDegradation()` с правилами автоотката.»
5. «Реализуй `testTenantIsolation()` для проверки изоляции в macro-cycle.»

---

*См. также: [IMPACTS.md](../../IMPACTS.md) — полный список параметров и их влияние*
