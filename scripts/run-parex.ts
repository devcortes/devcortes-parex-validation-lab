import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const environment =
    process.argv[2] ?? 'dev';

const reportFile = path.resolve(
    'test-results/parex-results.json'
);

const env = {
    ...process.env,
    TEST_ENV: environment,
};

/*
 * En Windows, npm/npx son archivos .cmd.
 * shell=true permite ejecutarlos correctamente desde spawnSync.
 */
const npxCommand =
    process.platform === 'win32'
        ? 'npx.cmd'
        : 'npx';

/*
 * Evitamos ingerir accidentalmente un JSON
 * perteneciente a una ejecución anterior.
 */
fs.rmSync(
    reportFile,
    {
        force: true,
    }
);

console.log('');
console.log(
    '=========================================='
);
console.log(
    ' PAREX Automated Validation'
);
console.log(
    ` Ambiente : ${environment.toUpperCase()}`
);
console.log(
    '=========================================='
);
console.log('');

/*
 * ============================================================
 * 1. EJECUTAR SUITE FORMAL PAREX
 * ============================================================
 */
const testRun = spawnSync(
    npxCommand,
    [
        'playwright',
        'test',
        'tests/euv',
        'tests/validation',
        '--workers=1',
    ],
    {
        stdio: 'inherit',
        env,

        /*
         * Necesario para .cmd en Windows/Git Bash.
         */
        shell:
            process.platform === 'win32',
    }
);

/*
 * Si ni siquiera pudimos arrancar Playwright,
 * lo informamos explícitamente.
 */
if (testRun.error) {
    console.error('');
    console.error(
        'No fue posible iniciar Playwright:'
    );
    console.error(
        testRun.error
    );

    process.exit(2);
}

const testExitCode =
    testRun.status ?? 1;

/*
 * ============================================================
 * 2. VERIFICAR REPORTE
 * ============================================================
 */
if (!fs.existsSync(reportFile)) {
    console.error('');
    console.error(
        'Playwright terminó pero no generó:'
    );
    console.error(
        reportFile
    );

    console.error(
        `Exit code de Playwright: ${testExitCode}`
    );

    process.exit(2);
}

/*
 * ============================================================
 * 3. INGESTAR RESULTADOS
 * ============================================================
 *
 * MUY IMPORTANTE:
 *
 * La ingestión ocurre incluso si Playwright devolvió != 0.
 *
 * Eso permite registrar FAIL/BLOCKED en PostgreSQL/Grafana.
 */
console.log('');
console.log(
    'Persistiendo resultados PAREX...'
);
console.log('');

const ingestion = spawnSync(
    npxCommand,
    [
        'tsx',
        'scripts/ingest-results.ts',
    ],
    {
        stdio: 'inherit',
        env,
        shell:
            process.platform === 'win32',
    }
);

if (ingestion.error) {
    console.error('');
    console.error(
        'No fue posible iniciar el ingestor:'
    );
    console.error(
        ingestion.error
    );

    process.exit(2);
}

const ingestionExitCode =
    ingestion.status ?? 1;

if (ingestionExitCode !== 0) {
    console.error('');
    console.error(
        'La suite terminó, pero no fue posible persistir sus resultados.'
    );

    process.exit(2);
}

/*
 * ============================================================
 * 4. RESUMEN
 * ============================================================
 */
console.log('');
console.log(
    '=========================================='
);
console.log(
    ' PAREX Run Completed'
);
console.log(
    ` Ambiente          : ${environment.toUpperCase()}`
);
console.log(
    ` Playwright exit   : ${testExitCode}`
);
console.log(
    ' Resultados        : persistidos'
);
console.log(
    ' Grafana           : disponible'
);
console.log(
    '=========================================='
);
console.log('');

/*
 * Conservamos el exit code real de las pruebas.
 *
 * 0     -> suite completamente verde
 * != 0  -> hubo FAIL, pero los resultados ya quedaron
 *          almacenados para observabilidad.
 */
process.exit(
    testExitCode
);