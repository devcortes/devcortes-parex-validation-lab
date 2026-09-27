import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

import {
    environments,
    TestEnvironment,
} from './config/environments';

const target = (process.env.TEST_ENV ?? 'dev') as TestEnvironment;

if (!(target in environments)) {
    throw new Error(
        `TEST_ENV inválido: "${target}". Usa "dev" o "pro".`
    );
}

const environment = environments[target];

dotenv.config({
    path: `.env.${target}.local`,
});

console.log('');
console.log('==========================================');
console.log(` PAREX Validation Lab`);
console.log(` Ambiente : ${environment.name.toUpperCase()}`);
console.log(` URL      : ${environment.baseURL}`);
console.log('==========================================');
console.log('');

export default defineConfig({
    testDir: './tests',

    timeout: 30_000,

    expect: {
        timeout: 10_000,
    },

    use: {
        baseURL: environment.baseURL,

        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        {
            name: 'setup',
            testMatch: /.*\.setup\.ts/,

            use: {
                ...devices['Desktop Chrome'],
            },
        },

        {
            name: 'portal',
            testMatch: /.*\.portal\.spec\.ts/,
            dependencies: ['setup'],

            use: {
                ...devices['Desktop Chrome'],
                storageState: `.auth/${target}-user.json`,
            },
        },

        {
            name: 'public',
            testMatch: /.*\.public\.spec\.ts/,

            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],

    reporter: [
        ['list'],
        [
            'html',
            {
                outputFolder: 'playwright-report',
                open: 'never',
            },
        ],
    ],
});