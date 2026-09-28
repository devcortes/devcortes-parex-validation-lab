CREATE TABLE IF NOT EXISTS test_runs (
    id BIGSERIAL PRIMARY KEY,

    run_id VARCHAR(100) NOT NULL UNIQUE,

    environment VARCHAR(20) NOT NULL,

    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,

    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    blocked INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,

    duration_ms BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS test_results (
    id BIGSERIAL PRIMARY KEY,

    run_id VARCHAR(100) NOT NULL
        REFERENCES test_runs(run_id)
        ON DELETE CASCADE,

    test_id VARCHAR(100) NOT NULL,

    test_type VARCHAR(30) NOT NULL,

    use_case VARCHAR(30),

    title TEXT NOT NULL,

    status VARCHAR(20) NOT NULL,

    duration_ms BIGINT,

    environment VARCHAR(20) NOT NULL,

    has_workaround BOOLEAN NOT NULL DEFAULT FALSE,

    known_issue VARCHAR(100),

    error_message TEXT,

    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_test_results_run
ON test_results(run_id);


CREATE INDEX IF NOT EXISTS idx_test_results_test_id
ON test_results(test_id);


CREATE INDEX IF NOT EXISTS idx_test_results_status
ON test_results(status);


CREATE TABLE IF NOT EXISTS evidences (
    id BIGSERIAL PRIMARY KEY,

    run_id VARCHAR(100) NOT NULL
        REFERENCES test_runs(run_id)
        ON DELETE CASCADE,

    test_id VARCHAR(100) NOT NULL,

    evidence_type VARCHAR(50) NOT NULL,

    name VARCHAR(255) NOT NULL,

    path TEXT,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS known_issues (
    id BIGSERIAL PRIMARY KEY,

    issue_id VARCHAR(100) NOT NULL UNIQUE,

    title TEXT NOT NULL,

    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',

    workaround TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);


INSERT INTO known_issues (
    issue_id,
    title,
    description,
    workaround
)
VALUES (
    'DEF-UC3-SIGN-001',
    'La ceremonia de firma requiere recargar el proceso',
    'Después de Documents -> Signature, Firmar ahora puede responder signature_required antes de que el detalle de la ceremonia quede hidratado.',
    'Recargar la página en etapa Signature antes de iniciar la ceremonia.'
)
ON CONFLICT (issue_id) DO NOTHING;


/*
 * ---------------------------------------------------------------------------
 * PAREX Semantic Catalog
 * ---------------------------------------------------------------------------
 *
 * test_results responde:
 *   ¿Qué ocurrió durante una ejecución?
 *
 * test_definitions responde:
 *   ¿Qué significa funcionalmente la prueba?
 *
 * El catálogo YAML sigue siendo la fuente de verdad.
 * Esta tabla es una proyección consultable para PostgreSQL y Grafana.
 */
CREATE TABLE IF NOT EXISTS test_definitions (
    test_id VARCHAR(100) PRIMARY KEY,

    schema_version INTEGER NOT NULL,

    name TEXT NOT NULL,

    kind VARCHAR(30) NOT NULL,

    catalog_status VARCHAR(30) NOT NULL,

    capability VARCHAR(100),

    use_case_id VARCHAR(30),

    use_case_name TEXT,

    objective TEXT NOT NULL,

    given_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    when_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    then_steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    risk_level VARCHAR(20) NOT NULL,

    risk_description TEXT NOT NULL,

    count_as_scenario BOOLEAN NOT NULL,

    allowed_environments JSONB NOT NULL DEFAULT '[]'::jsonb,

    default_environment VARCHAR(20) NOT NULL,

    automation_framework VARCHAR(50) NOT NULL,

    automation_project VARCHAR(100) NOT NULL,

    automation_spec TEXT NOT NULL,

    runtime_id_template TEXT,

    preconditions JSONB NOT NULL DEFAULT '[]'::jsonb,

    testability_contract JSONB NOT NULL DEFAULT '[]'::jsonb,

    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,

    tags JSONB NOT NULL DEFAULT '[]'::jsonb,

    suites JSONB NOT NULL DEFAULT '[]'::jsonb,

    architecture JSONB NOT NULL DEFAULT '[]'::jsonb,

    sequence INTEGER NOT NULL DEFAULT 0,

    catalog_file TEXT NOT NULL,

    catalog_hash VARCHAR(64) NOT NULL,

    /*
     * Nunca eliminamos automáticamente una definición antigua.
     *
     * Si desaparece del catálogo actual queda is_present = FALSE.
     * Esto permite interpretar ejecuciones históricas sin contaminar
     * la cobertura vigente.
     */
    is_present BOOLEAN NOT NULL DEFAULT TRUE,

    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_test_definitions_kind
        CHECK (
            kind IN (
                'euv',
                'validation',
                'precondition'
            )
        ),

    CONSTRAINT chk_test_definitions_risk
        CHECK (
            risk_level IN (
                'low',
                'medium',
                'high',
                'critical'
            )
        ),

    CONSTRAINT chk_test_definitions_given_array
        CHECK (
            jsonb_typeof(given_steps) = 'array'
        ),

    CONSTRAINT chk_test_definitions_when_array
        CHECK (
            jsonb_typeof(when_steps) = 'array'
        ),

    CONSTRAINT chk_test_definitions_then_array
        CHECK (
            jsonb_typeof(then_steps) = 'array'
        )
);


CREATE INDEX IF NOT EXISTS idx_test_definitions_kind
ON test_definitions(kind);


CREATE INDEX IF NOT EXISTS idx_test_definitions_use_case
ON test_definitions(use_case_id);


CREATE INDEX IF NOT EXISTS idx_test_definitions_risk
ON test_definitions(risk_level);


CREATE INDEX IF NOT EXISTS idx_test_definitions_present
ON test_definitions(is_present);


CREATE INDEX IF NOT EXISTS idx_test_definitions_count_scenario
ON test_definitions(count_as_scenario);


/*
 * Vista semántica principal.
 *
 * LEFT JOIN es intencional:
 * una ejecución histórica nunca desaparece porque no encontremos
 * su definición en el catálogo actual.
 */
CREATE OR REPLACE VIEW vw_parex_test_results_semantic AS
SELECT
    r.id,

    r.run_id,

    r.test_id,

    r.environment,

    r.status,

    r.duration_ms,

    r.started_at,

    r.finished_at,

    r.has_workaround,

    r.known_issue,

    r.error_message,

    r.title AS runtime_title,

    r.test_type AS runtime_test_type,

    r.use_case AS runtime_use_case,

    d.test_id IS NOT NULL
        AS catalog_registered,

    COALESCE(
        d.name,
        r.title
    ) AS scenario_name,

    COALESCE(
        UPPER(d.kind),
        r.test_type
    ) AS semantic_type,

    d.catalog_status,

    d.capability,

    COALESCE(
        d.use_case_id,
        r.use_case
    ) AS use_case_id,

    d.use_case_name,

    d.objective,

    d.given_steps,

    d.when_steps,

    d.then_steps,

    d.risk_level,

    d.risk_description,

    COALESCE(
        d.count_as_scenario,
        CASE
            WHEN r.test_type = 'PRECONDITION'
                THEN FALSE
            ELSE TRUE
        END
    ) AS count_as_scenario,

    d.allowed_environments,

    d.default_environment,

    d.automation_framework,

    d.automation_project,

    d.automation_spec,

    d.runtime_id_template,

    d.preconditions,

    d.testability_contract,

    d.evidence,

    d.tags,

    d.suites,

    d.architecture,

    d.sequence,

    d.is_present AS catalog_present

FROM test_results r

LEFT JOIN test_definitions d
    ON d.test_id = r.test_id;


/*
 * Catálogo vigente de escenarios funcionales.
 *
 * PRE no aparece aquí porque count_as_scenario = FALSE.
 */
CREATE OR REPLACE VIEW vw_parex_catalog_scenarios AS
SELECT
    test_id,

    name,

    kind,

    catalog_status,

    capability,

    use_case_id,

    use_case_name,

    objective,

    given_steps,

    when_steps,

    then_steps,

    risk_level,

    risk_description,

    allowed_environments,

    default_environment,

    automation_project,

    automation_spec,

    preconditions,

    tags,

    suites,

    architecture,

    sequence,

    updated_at

FROM test_definitions

WHERE
    is_present = TRUE
    AND count_as_scenario = TRUE;