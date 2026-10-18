import * as os from 'node:os';
import * as path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const env = {
  NODE_ENV: 'test',
  MONGO_URI: process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:17017/rigtracker_test',
  UPLOADS_DIR: path.join(os.tmpdir(), `rigtracker-test-uploads-${process.pid}`),
};
// Global setup runs in this process, before `test.env` reaches the workers.
Object.assign(process.env, env);

export default defineConfig({
  // SWC keeps the decorator metadata that NestJS dependency injection relies on.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env,
  },
});
