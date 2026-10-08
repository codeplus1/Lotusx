#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LotusX Lockfile Integrity Validator
 * Verifies that:
 * 1. bun.lock exists and is valid.
 * 2. lockfileVersion matches modern Bun standard (>= 1).
 * 3. All direct dependencies declared in package.json are tracked in the lockfile.
 * 4. No package resolution uses unencrypted plain HTTP (http://) registry endpoints.
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const BUN_LOCK_PATH = path.join(ROOT_DIR, 'bun.lock');
const NPM_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');

console.log('🔒 Verifying Dependency Lockfile Integrity...');

if (!fs.existsSync(PACKAGE_JSON_PATH)) {
  console.error('❌ package.json is missing!');
  process.exit(1);
}

const lockfilePath = fs.existsSync(BUN_LOCK_PATH) ? BUN_LOCK_PATH : (fs.existsSync(NPM_LOCK_PATH) ? NPM_LOCK_PATH : null);

if (!lockfilePath) {
  console.error('❌ Lockfile is missing! Expected bun.lock in repository root.');
  process.exit(1);
}

const isBunLock = lockfilePath.endsWith('bun.lock');
console.log(`📦 Analyzing lockfile: ${path.basename(lockfilePath)} (${isBunLock ? 'Bun format' : 'npm format'})`);

let pkg;
let lock;

try {
  pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
} catch (err) {
  console.error('❌ Failed to parse package.json:', err.message);
  process.exit(1);
}

try {
  const rawLock = fs.readFileSync(lockfilePath, 'utf8');
  // Bun lockfiles use JSON with potential trailing commas
  const cleanedLock = rawLock.replace(/,(\s*[}\]])/g, '$1');
  lock = JSON.parse(cleanedLock);
} catch (err) {
  console.error(`❌ Failed to parse ${path.basename(lockfilePath)}:`, err.message);
  process.exit(1);
}

if (!lock.lockfileVersion || lock.lockfileVersion < 1) {
  console.error(`❌ Insecure or outdated lockfileVersion: ${lock.lockfileVersion}. Expected >= 1.`);
  process.exit(1);
}

const allDeclared = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
};

let missingCount = 0;
let insecureUrls = 0;

if (isBunLock) {
  // Bun lockfile verification
  const workspaceRoot = lock.workspaces?.[''] || {};
  const rootDeps = {
    ...(workspaceRoot.dependencies || {}),
    ...(workspaceRoot.devDependencies || {}),
  };
  const packages = lock.packages || {};

  for (const depName of Object.keys(allDeclared)) {
    const inWorkspace = Boolean(rootDeps[depName]);
    const inPackages = Boolean(
      packages[depName] ||
      Object.keys(packages).some((k) => k === depName || k.startsWith(`${depName}@`))
    );

    if (!inWorkspace && !inPackages) {
      console.error(`❌ Declared dependency "${depName}" is missing from bun.lock!`);
      missingCount++;
    }
  }

  // Check for insecure HTTP resolutions in all packages
  for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
    const serialized = JSON.stringify(pkgInfo);
    if (serialized.includes('http://')) {
      console.error(`❌ Insecure unencrypted HTTP resolution for "${pkgPath}"`);
      insecureUrls++;
    }
  }
} else {
  // Standard npm lockfile verification
  const packages = lock.packages || {};
  for (const depName of Object.keys(allDeclared)) {
    const pkgKey = `node_modules/${depName}`;
    if (!packages[pkgKey] && !(lock.dependencies && lock.dependencies[depName])) {
      console.error(`❌ Declared dependency "${depName}" is missing from lockfile!`);
      missingCount++;
    }
  }

  for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
    if (pkgInfo.resolved && typeof pkgInfo.resolved === 'string') {
      if (pkgInfo.resolved.startsWith('http://')) {
        console.error(`❌ Insecure unencrypted HTTP resolution for "${pkgPath}": ${pkgInfo.resolved}`);
        insecureUrls++;
      }
    }
  }
}

if (missingCount > 0 || insecureUrls > 0) {
  console.error(`❌ Lockfile verification failed: ${missingCount} missing dependencies, ${insecureUrls} insecure resolutions.`);
  process.exit(1);
}

console.log(`✅ Lockfile Integrity Verified: ${path.basename(lockfilePath)} v${lock.lockfileVersion}, ${Object.keys(allDeclared).length} declared dependencies locked, 0 insecure HTTP resolutions.`);
process.exit(0);
