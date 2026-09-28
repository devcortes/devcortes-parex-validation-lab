import {
    spawnSync,
} from 'node:child_process';

const args =
    process.argv.slice(2);

const executable =
    process.platform === 'win32'
        ? 'npx.cmd'
        : 'npx';

function execute(
    script: string,
    scriptArgs: string[]
): number {
    const result =
        spawnSync(
            executable,
            [
                'tsx',
                script,
                ...scriptArgs,
            ],
            {
                cwd:
                    process.cwd(),

                stdio:
                    'inherit',

                shell:
                    process.platform ===
                    'win32',
            }
        );

    return (
        result.status ??
        1
    );
}

/*
 * Con argumentos conservamos completamente el CLI existente.
 *
 * Ejemplos:
 *
 * npm run parex -- list
 * npm run parex -- explain EUV-UC3-009
 * npm run parex -- run --suite signing
 */
if (
    args.length > 0
) {
    process.exit(
        execute(
            'scripts/parex.ts',
            args
        )
    );
}

/*
 * En terminales con soporte TTY usamos el menú enriquecido.
 *
 * Git Bash / MSYS puede exponer stdin sin isTTY aunque exista
 * interacción humana. Para ese caso utilizamos un menú basado
 * en readline que funciona mediante opciones numeradas.
 */
const richTerminal =
    Boolean(
        process.stdin.isTTY &&
        process.stdout.isTTY
    );

if (
    richTerminal
) {
    process.exit(
        execute(
            'scripts/parex-menu.ts',
            []
        )
    );
}

console.log('');
console.log(
    'PAREX · Modo interactivo compatible con Git Bash'
);
console.log('');

process.exit(
    execute(
        'scripts/parex-menu-fallback.ts',
        []
    )
);