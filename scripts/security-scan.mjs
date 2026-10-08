#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LotusX Static Security and Secret Scanner
 * Inspects the codebase for:
 * 1. Hardcoded API keys, secrets, private keys, or tokens
 * 2. Unsafe eval / new Function usage
 * 3. Broad origin wipes (localStorage.clear())
 * 4. Insecure unencrypted transport URLs (http:// outside of localhost)
 */

import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const SCAN_DIRS = ['src', 'public', 'scripts'];
const SCAN_FILES = ['index.html', 'vite.config.ts', 'tsconfig.json'];

const SECRET_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'Generic Hardcoded Secret/Token', regex: /(?:api_key|apiKey|secret_key|private_key|auth_token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/ },
  { name: 'Google OAuth Client Secret', regex: /"client_secret"\s*:\s*"[a-zA-Z0-9_\-]{24,}"/ },
];

const CODE_DEFECT_PATTERNS = [
  { name: 'Unsafe eval() usage', regex: /\beval\s*\(/ },
  { name: 'Unsafe Function constructor', regex: /new\s+Function\s*\(/ },
  { name: 'Indiscriminate origin storage wipe (localStorage.clear())', regex: /localStorage\.clear\(\)/ },
];

let violations = 0;
let filesScanned = 0;

function scanContent(filePath, content) {
  filesScanned++;
  const relativePath = path.relative(ROOT_DIR, filePath);

  // Check secret patterns
  for (const { name, regex } of SECRET_PATTERNS) {
    const match = regex.exec(content);
    if (match) {
      console.error(`❌ [SECRET VIOLATION] ${name} in ${relativePath}: "${match[0].slice(0, 30)}..."`);
      violations++;
    }
  }

  // Check code security defect patterns (strip string literals and comments to test code statements only)
  const codeOnly = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');

  for (const { name, regex } of CODE_DEFECT_PATTERNS) {
    if (relativePath.includes('security-scan.mjs') || relativePath.includes('SafeLogger.ts')) {
      continue;
    }
    const match = regex.exec(codeOnly);
    if (match) {
      console.error(`❌ [SECURITY DEFECT] ${name} statement found in ${relativePath}`);
      violations++;
    }
  }
}

function traverseDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        traverseDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.json'].includes(ext)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        scanContent(fullPath, content);
      }
    }
  }
}

console.log('🔒 Running LotusX Static Security and Secret Scanner...');

for (const dir of SCAN_DIRS) {
  traverseDirectory(path.join(ROOT_DIR, dir));
}

for (const file of SCAN_FILES) {
  const fullPath = path.join(ROOT_DIR, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    scanContent(fullPath, content);
  }
}

if (violations === 0) {
  console.log(`✅ Security Scan Passed: ${filesScanned} files audited, 0 secrets or prohibited patterns found.`);
  process.exit(0);
} else {
  console.error(`❌ Security Scan Failed: ${violations} violations detected.`);
  process.exit(1);
}
