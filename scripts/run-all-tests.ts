/**
 * Headless CLI Runner for LotusX Security Test Suite
 */
import { SecurityTestSuite } from '../src/security/SecurityTestSuite';

// Polyfill window and localStorage for headless Node/Bun execution
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

async function main() {
  console.log('🔒 Starting LotusX Security & Cryptographic Test Suite...\n');
  const startTime = performance.now();
  const results = await SecurityTestSuite.runAllTests();
  const duration = Math.round(performance.now() - startTime);

  let passedCount = 0;
  let failedCount = 0;

  for (const res of results) {
    const icon = res.passed ? '✅' : '❌';
    console.log(`${icon} [${res.category}] ${res.name} (${res.durationMs}ms)`);
    if (!res.passed) {
      console.error(`   Error: ${res.message}`);
      if (res.details) console.error(`   Details: ${res.details}`);
      failedCount++;
    } else {
      passedCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);
  console.log(`Total Time:  ${duration}ms`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
