import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/engine/dataset.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, GMC_STRICT_DATASET: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
