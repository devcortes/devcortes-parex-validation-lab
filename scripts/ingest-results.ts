import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
    Client,
} from 'pg';

const ROOT =
    process.cwd();

const RESULTS_FILE =
    path.resolve(
        ROOT,
        'test-results',
        'parex-results.json'
    );

const ARTIFACTS_DIR =
    path.resolve(
        ROOT,
        'artifacts'
    );

type Annotation = {
    type?: string;
    description?: string;
};

type Attachment = {
    name?: string;
    contentType?: string;
    path?: string;
    body?: string;
};

type PlaywrightResult = {
    status?: string;

    duration?: number;

    startTime?: string;

    error?: {
        message?: string;
        stack?: string;
    };

    errors?: Array<{
        message?: string;
        stack?: string;
    }>;

    attachments?: Attachment[];
};

type PlaywrightTest = {
    projectName?: string;

    status?: string;

    annotations?: Annotation[];

    results?: PlaywrightResult[];
};

type PlaywrightSpec = {
    title?: string;

    ok?: boolean;

    tests?: PlaywrightTest[];
};

type PlaywrightSuite = {
    title?: string;

    file?: string;

    suites?: PlaywrightSuite[];

    specs?: PlaywrightSpec[];
};

type PlaywrightReport = {
    config?: unknown;

    suites?: PlaywrightSuite[];
};

type FlatTestResult = {
    testId: string;

    testType: string;

    useCase: string | null;

    title: string;

    status: string;

    durationMs: number;

    startedAt: Date | null;

    finishedAt: Date | null;

    projectName: string | null;

    hasWorkaround: boolean;

    knownIssue: string | null;

    errorMessage: string | null;

    attachments: Attachment[];
};

type ArtifactInfo = {
    relativePath: string;

    bytes: number;

    sha256: string;

    storageKind:
    | 'inline-body'
    | 'source-path';

    redacted:
    boolean;
};

type ManifestArtifact = {
    testId: string;

    name: string;

    contentType: string | null;

    path: string;

    bytes: number;

    sha256: string;

    storageKind: string;

    redacted: boolean;
};

function normalizePath(
    value: string
): string {
    return value.replace(
        /\\/g,
        '/'
    );
}

function extractTestId(
    title: string
): string {
    const match =
        title.match(
            /\b(?:EUV|VAL|PRE)-[A-Z0-9-]+/
        );

    if (
        match
    ) {
        return match[0];
    }

    return title
        .trim()
        .replace(
            /\s+/g,
            '-'
        )
        .toUpperCase();
}

function inferTestType(
    testId: string
): string {
    if (
        testId.startsWith(
            'EUV-'
        )
    ) {
        return 'EUV';
    }

    if (
        testId.startsWith(
            'VAL-'
        )
    ) {
        return 'VALIDATION';
    }

    if (
        testId.startsWith(
            'PRE-'
        )
    ) {
        return 'PRECONDITION';
    }

    return 'OTHER';
}

function inferUseCase(
    testId: string,
    title: string
): string | null {
    const value =
        `${testId} ${title}`.match(
            /\bUC\d+\b/i
        );

    return value
        ? value[0].toUpperCase()
        : null;
}

function mapStatus(
    resultStatus:
        string | undefined,
    annotations:
        Annotation[]
): string {
    const blocked =
        annotations.some(
            (annotation) =>
                annotation.type
                    ?.toLowerCase() ===
                'blocked'
        );

    if (
        blocked
    ) {
        return 'BLOCKED';
    }

    switch (
    resultStatus
    ) {
        case 'passed':
            return 'PASS';

        case 'skipped':
            return 'SKIPPED';

        case 'failed':
        case 'timedOut':
        case 'interrupted':
            return 'FAIL';

        default:
            return 'UNKNOWN';
    }
}

function annotationValue(
    annotations:
        Annotation[],
    type: string
): string | null {
    const annotation =
        annotations.find(
            (item) =>
                item.type
                    ?.toLowerCase() ===
                type.toLowerCase()
        );

    return (
        annotation?.description ??
        null
    );
}

function collectSpecs(
    suite: PlaywrightSuite,
    target:
        FlatTestResult[]
): void {
    for (
        const spec
        of suite.specs ??
        []
    ) {
        const title =
            spec.title ??
            'Unnamed test';

        for (
            const playwrightTest
            of spec.tests ??
            []
        ) {
            /*
             * Normalmente existe un solo resultado.
             *
             * En caso de retry Playwright puede entregar varios.
             * Para observabilidad conservamos el resultado FINAL.
             */
            const executions =
                playwrightTest.results ??
                [];

            const result =
                executions.length >
                    0
                    ? executions[
                    executions.length -
                    1
                    ]
                    : undefined;

            const annotations =
                playwrightTest.annotations ??
                [];

            const testId =
                extractTestId(
                    title
                );

            const durationMs =
                result?.duration ??
                0;

            const startedAt =
                result?.startTime
                    ? new Date(
                        result.startTime
                    )
                    : null;

            const finishedAt =
                startedAt
                    ? new Date(
                        startedAt.getTime() +
                        durationMs
                    )
                    : null;

            const knownIssue =
                annotationValue(
                    annotations,
                    'known_issue'
                );

            const workaround =
                annotationValue(
                    annotations,
                    'workaround'
                );

            const errorMessage =
                result
                    ?.error
                    ?.message ??
                result
                    ?.errors
                    ?.[0]
                    ?.message ??
                null;

            target.push({
                testId,

                testType:
                    inferTestType(
                        testId
                    ),

                useCase:
                    inferUseCase(
                        testId,
                        title
                    ),

                title,

                status:
                    mapStatus(
                        result?.status,
                        annotations
                    ),

                durationMs,

                startedAt,

                finishedAt,

                projectName:
                    playwrightTest
                        .projectName ??
                    null,

                hasWorkaround:
                    Boolean(
                        workaround
                    ),

                knownIssue,

                errorMessage,

                attachments:
                    result
                        ?.attachments ??
                    [],
            });
        }
    }

    for (
        const child
        of suite.suites ??
        []
    ) {
        collectSpecs(
            child,
            target
        );
    }
}

function flattenReport(
    report:
        PlaywrightReport
): FlatTestResult[] {
    const results:
        FlatTestResult[] =
        [];

    for (
        const suite
        of report.suites ??
        []
    ) {
        collectSpecs(
            suite,
            results
        );
    }

    return results;
}

function determineEnvironment():
    string {
    return (
        process.env.TEST_ENV ??
        process.env.PAREX_ENV ??
        'dev'
    ).toUpperCase();
}

function sanitizeSegment(
    value: string
): string {
    const sanitized =
        value
            .trim()
            .replace(
                /[^a-zA-Z0-9._-]+/g,
                '-'
            )
            .replace(
                /-+/g,
                '-'
            )
            .replace(
                /^[-.]+|[-.]+$/g,
                ''
            );

    return (
        sanitized ||
        'artifact'
    );
}

function extensionForContentType(
    contentType:
        string | undefined,
    sourcePath:
        string | undefined
): string {
    if (
        sourcePath
    ) {
        const sourceExtension =
            path.extname(
                sourcePath
            );

        if (
            sourceExtension
        ) {
            return sourceExtension;
        }
    }

    switch (
    contentType
    ) {
        case 'image/png':
            return '.png';

        case 'image/jpeg':
            return '.jpg';

        case 'application/json':
            return '.json';

        case 'text/plain':
            return '.txt';

        case 'video/webm':
            return '.webm';

        case 'application/zip':
            return '.zip';

        case 'application/octet-stream':
            return '.bin';

        default:
            return '.bin';
    }
}

function sensitiveJsonKey(
    key: string
): boolean {
    const normalized =
        key
            .replace(
                /[^a-zA-Z0-9]/g,
                ''
            )
            .toLowerCase();

    const exact =
        new Set([
            'password',
            'authorization',
            'accesstoken',
            'refreshtoken',
            'idtoken',
            'token',
            'secret',
            'apikey',
            'debugotp',
            'debugotpkey',
            'otpcode',
        ]);

    if (
        exact.has(
            normalized
        )
    ) {
        return true;
    }

    return (
        normalized.endsWith(
            'password'
        ) ||
        normalized.endsWith(
            'secret'
        ) ||
        normalized.endsWith(
            'accesstoken'
        ) ||
        normalized.endsWith(
            'refreshtoken'
        ) ||
        normalized.endsWith(
            'apikey'
        )
    );
}

function redactJson(
    value: unknown
): unknown {
    if (
        Array.isArray(
            value
        )
    ) {
        return value.map(
            redactJson
        );
    }

    if (
        value !== null &&
        typeof value ===
        'object'
    ) {
        const source =
            value as Record<
                string,
                unknown
            >;

        const target:
            Record<
                string,
                unknown
            > = {};

        for (
            const [
                key,
                child,
            ]
            of Object.entries(
                source
            )
        ) {
            target[
                key
            ] =
                sensitiveJsonKey(
                    key
                )
                    ? '[REDACTED]'
                    : redactJson(
                        child
                    );
        }

        return target;
    }

    return value;
}

function prepareInlineBody(
    attachment:
        Attachment
): {
    bytes: Buffer;
    redacted: boolean;
} {
    if (
        typeof attachment.body !==
        'string'
    ) {
        throw new Error(
            'El attachment no contiene body inline.'
        );
    }

    const raw =
        Buffer.from(
            attachment.body,
            'base64'
        );

    if (
        attachment.contentType ===
        'image/png'
    ) {
        const signature =
            raw
                .subarray(
                    0,
                    8
                )
                .toString(
                    'hex'
                );

        if (
            signature !==
            '89504e470d0a1a0a'
        ) {
            throw new Error(
                `Attachment PNG inválido: ${attachment.name ??
                'unnamed'
                }`
            );
        }
    }

    if (
        attachment.contentType ===
        'application/json'
    ) {
        const text =
            raw.toString(
                'utf8'
            );

        const parsed =
            JSON.parse(
                text
            );

        const redacted =
            redactJson(
                parsed
            );

        return {
            bytes:
                Buffer.from(
                    JSON.stringify(
                        redacted,
                        null,
                        2
                    ) +
                    '\n',
                    'utf8'
                ),

            redacted:
                true,
        };
    }

    return {
        bytes:
            raw,

        redacted:
            false,
    };
}

function materializeAttachment(
    runId: string,
    result:
        FlatTestResult,
    attachment:
        Attachment,
    index: number
): ArtifactInfo | null {
    const testDirectory =
        path.join(
            ARTIFACTS_DIR,
            sanitizeSegment(
                runId
            ),
            sanitizeSegment(
                result.testId
            )
        );

    fs.mkdirSync(
        testDirectory,
        {
            recursive:
                true,
        }
    );

    const extension =
        extensionForContentType(
            attachment.contentType,
            attachment.path
        );

    const baseName =
        sanitizeSegment(
            attachment.name ??
            `attachment-${index + 1}`
        );

    const filename =
        `${String(
            index + 1
        ).padStart(
            2,
            '0'
        )}-${baseName}${extension}`;

    const destination =
        path.join(
            testDirectory,
            filename
        );

    let bytes:
        Buffer;

    let storageKind:
        ArtifactInfo['storageKind'];

    let redacted =
        false;

    if (
        typeof attachment.body ===
        'string'
    ) {
        const prepared =
            prepareInlineBody(
                attachment
            );

        bytes =
            prepared.bytes;

        redacted =
            prepared.redacted;

        storageKind =
            'inline-body';
    } else if (
        attachment.path
    ) {
        const source =
            path.isAbsolute(
                attachment.path
            )
                ? attachment.path
                : path.resolve(
                    ROOT,
                    attachment.path
                );

        if (
            !fs.existsSync(
                source
            )
        ) {
            console.warn(
                `WARN: attachment path no existe: ${attachment.path}`
            );

            return null;
        }

        bytes =
            fs.readFileSync(
                source
            );

        storageKind =
            'source-path';
    } else {
        return null;
    }

    fs.writeFileSync(
        destination,
        bytes
    );

    const hash =
        crypto
            .createHash(
                'sha256'
            )
            .update(
                bytes
            )
            .digest(
                'hex'
            );

    return {
        relativePath:
            normalizePath(
                path.relative(
                    ROOT,
                    destination
                )
            ),

        bytes:
            bytes.length,

        sha256:
            hash,

        storageKind,

        redacted,
    };
}

function writeManifest(
    runId: string,
    environment: string,
    artifacts:
        ManifestArtifact[]
): void {
    const runDirectory =
        path.join(
            ARTIFACTS_DIR,
            sanitizeSegment(
                runId
            )
        );

    fs.mkdirSync(
        runDirectory,
        {
            recursive:
                true,
        }
    );

    const manifest = {
        runId,

        environment,

        generatedAt:
            new Date()
                .toISOString(),

        artifactCount:
            artifacts.length,

        artifacts,
    };

    fs.writeFileSync(
        path.join(
            runDirectory,
            'manifest.json'
        ),
        JSON.stringify(
            manifest,
            null,
            2
        ) +
        '\n',
        'utf8'
    );
}

async function main():
    Promise<void> {
    if (
        !fs.existsSync(
            RESULTS_FILE
        )
    ) {
        throw new Error(
            `No existe el reporte JSON: ${RESULTS_FILE}`
        );
    }

    const raw =
        fs.readFileSync(
            RESULTS_FILE,
            'utf8'
        );

    const report =
        JSON.parse(
            raw
        ) as PlaywrightReport;

    const results =
        flattenReport(
            report
        );

    if (
        results.length ===
        0
    ) {
        throw new Error(
            'El reporte no contiene pruebas para importar.'
        );
    }

    /*
     * Hash del reporte.
     *
     * Si ejecutamos el ingestor dos veces sobre exactamente
     * el mismo JSON reutilizamos el mismo run_id.
     */
    const hash =
        crypto
            .createHash(
                'sha256'
            )
            .update(
                raw
            )
            .digest(
                'hex'
            )
            .slice(
                0,
                12
            );

    const dates =
        results
            .flatMap(
                (result) => [
                    result.startedAt,
                    result.finishedAt,
                ]
            )
            .filter(
                (
                    value
                ): value is Date =>
                    value instanceof
                    Date
            );

    const startedAt =
        dates.length >
            0
            ? new Date(
                Math.min(
                    ...dates.map(
                        (date) =>
                            date.getTime()
                    )
                )
            )
            : new Date();

    const finishedAt =
        dates.length >
            0
            ? new Date(
                Math.max(
                    ...dates.map(
                        (date) =>
                            date.getTime()
                    )
                )
            )
            : new Date();

    const compactTime =
        startedAt
            .toISOString()
            .replace(
                /[-:.TZ]/g,
                ''
            )
            .slice(
                0,
                14
            );

    const runId =
        `parex-${compactTime}-${hash}`;

    const environment =
        determineEnvironment();

    const passed =
        results.filter(
            (result) =>
                result.status ===
                'PASS'
        ).length;

    const failed =
        results.filter(
            (result) =>
                result.status ===
                'FAIL'
        ).length;

    const blocked =
        results.filter(
            (result) =>
                result.status ===
                'BLOCKED'
        ).length;

    const skipped =
        results.filter(
            (result) =>
                result.status ===
                'SKIPPED'
        ).length;

    const durationMs =
        finishedAt.getTime() -
        startedAt.getTime();

    const client =
        new Client({
            host:
                process.env
                    .PAREX_DB_HOST ??
                'localhost',

            port:
                Number(
                    process.env
                        .PAREX_DB_PORT ??
                    55432
                ),

            database:
                process.env
                    .PAREX_DB_NAME ??
                'parex',

            user:
                process.env
                    .PAREX_DB_USER ??
                'parex',

            password:
                process.env
                    .PAREX_DB_PASSWORD ??
                'parex_local',
        });

    const runArtifactDirectory =
        path.join(
            ARTIFACTS_DIR,
            sanitizeSegment(
                runId
            )
        );

    /*
     * La reimportación del mismo JSON reemplaza también
     * los artefactos físicos de ese run.
     */
    fs.rmSync(
        runArtifactDirectory,
        {
            recursive:
                true,

            force:
                true,
        }
    );

    await client.connect();

    const manifestArtifacts:
        ManifestArtifact[] =
        [];

    let artifactCount =
        0;

    try {
        await client.query(
            'BEGIN'
        );

        /*
         * Idempotencia:
         *
         * reimportar exactamente el mismo reporte reemplaza
         * la ejecución anterior.
         *
         * test_results y evidences se eliminan por CASCADE.
         */
        await client.query(
            `
            DELETE FROM test_runs
            WHERE run_id = $1
            `,
            [
                runId,
            ]
        );

        await client.query(
            `
            INSERT INTO test_runs (
                run_id,
                environment,
                started_at,
                finished_at,
                total,
                passed,
                failed,
                blocked,
                skipped,
                duration_ms
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10
            )
            `,
            [
                runId,
                environment,
                startedAt,
                finishedAt,
                results.length,
                passed,
                failed,
                blocked,
                skipped,
                durationMs,
            ]
        );

        for (
            const result
            of results
        ) {
            await client.query(
                `
                INSERT INTO test_results (
                    run_id,
                    test_id,
                    test_type,
                    use_case,
                    title,
                    status,
                    duration_ms,
                    environment,
                    has_workaround,
                    known_issue,
                    error_message,
                    started_at,
                    finished_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13
                )
                `,
                [
                    runId,
                    result.testId,
                    result.testType,
                    result.useCase,
                    result.title,
                    result.status,
                    result.durationMs,
                    environment,
                    result.hasWorkaround,
                    result.knownIssue,
                    result.errorMessage,
                    result.startedAt,
                    result.finishedAt,
                ]
            );

            for (
                let index = 0;
                index <
                result.attachments
                    .length;
                index += 1
            ) {
                const attachment =
                    result.attachments[
                    index
                    ];

                const artifact =
                    materializeAttachment(
                        runId,
                        result,
                        attachment,
                        index
                    );

                if (
                    artifact
                ) {
                    artifactCount +=
                        1;

                    manifestArtifacts.push({
                        testId:
                            result.testId,

                        name:
                            attachment.name ??
                            'attachment',

                        contentType:
                            attachment.contentType ??
                            null,

                        path:
                            artifact.relativePath,

                        bytes:
                            artifact.bytes,

                        sha256:
                            artifact.sha256,

                        storageKind:
                            artifact.storageKind,

                        redacted:
                            artifact.redacted,
                    });
                }

                const inline =
                    Boolean(
                        attachment.body
                    );

                const metadata = {
                    contentType:
                        attachment.contentType ??
                        null,

                    inline,

                    /*
                     * bodyLength corresponde al contenido Base64
                     * recibido originalmente desde Playwright.
                     */
                    bodyLength:
                        attachment.body
                            ?.length ??
                        null,

                    project:
                        result.projectName,

                    storageKind:
                        artifact
                            ?.storageKind ??
                        null,

                    storedBytes:
                        artifact
                            ?.bytes ??
                        null,

                    sha256:
                        artifact
                            ?.sha256 ??
                        null,

                    redacted:
                        artifact
                            ?.redacted ??
                        false,

                    originalPath:
                        attachment.path ??
                        null,
                };

                await client.query(
                    `
                    INSERT INTO evidences (
                        run_id,
                        test_id,
                        evidence_type,
                        name,
                        path,
                        metadata
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6::jsonb
                    )
                    `,
                    [
                        runId,

                        result.testId,

                        attachment
                            .contentType ??
                        'attachment',

                        attachment
                            .name ??
                        'attachment',

                        artifact
                            ?.relativePath ??
                        attachment.path ??
                        null,

                        JSON.stringify(
                            metadata
                        ),
                    ]
                );
            }
        }

        writeManifest(
            runId,
            environment,
            manifestArtifacts
        );

        await client.query(
            'COMMIT'
        );

        console.log('');
        console.log(
            '=========================================='
        );
        console.log(
            ' PAREX Result Ingestor'
        );
        console.log(
            '=========================================='
        );
        console.log(
            ` Run ID      : ${runId}`
        );
        console.log(
            ` Ambiente    : ${environment}`
        );
        console.log(
            ` Total       : ${results.length}`
        );
        console.log(
            ` PASS        : ${passed}`
        );
        console.log(
            ` FAIL        : ${failed}`
        );
        console.log(
            ` BLOCKED     : ${blocked}`
        );
        console.log(
            ` SKIPPED     : ${skipped}`
        );
        console.log(
            ` Evidencias  : ${artifactCount}`
        );
        console.log(
            ` Artifacts   : ${normalizePath(
                path.relative(
                    ROOT,
                    runArtifactDirectory
                )
            )}`
        );
        console.log(
            '=========================================='
        );
        console.log('');
    } catch (
    error
    ) {
        await client.query(
            'ROLLBACK'
        );

        throw error;
    } finally {
        await client.end();
    }
}

main()
    .catch(
        (
            error
        ) => {
            console.error('');
            console.error(
                'PAREX INGEST ERROR'
            );

            console.error(
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    )
            );

            console.error('');

            process.exit(1);
        }
    );