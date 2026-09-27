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