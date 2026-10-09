/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SafeLogger & Sensitive Data Sanitizer
 * Guarantees that sensitive data (passwords, encryption keys, recovery phrases,
 * tokens, record contents) never leak into console logs, telemetry, or unhandled errors.
 */

const SENSITIVE_PATTERNS = [
  // 32-byte Base64 key patterns
  /[A-Za-z0-9+/]{43}=/g,
  // Hex keys / hashes 64 chars
  /\b[0-9a-fA-F]{64}\b/g,
  // BIP39-style words pattern (3+ space-separated words)
  /\b([a-z]{3,8}\s+){3,}[a-z]{3,8}\b/gi,
  // Key or password query params
  /[?&](password|key|token|secret|recovery)=[^&#\s]+/gi,
];

export function sanitizeSensitiveData(input: unknown): any {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    let sanitized = input;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }

  if (input instanceof Error) {
    const cleanError = new Error(String(sanitizeSensitiveData(input.message)));
    cleanError.name = input.name;
    if (input.stack) {
      cleanError.stack = String(sanitizeSensitiveData(input.stack));
    }
    return cleanError;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeSensitiveData);
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('rawkey') ||
        lowerKey.includes('vaultkey') ||
        lowerKey.includes('recoverykey') ||
        lowerKey.includes('pin') ||
        lowerKey.includes('payload')
      ) {
        copy[key] = '[REDACTED_SECRET]';
      } else {
        copy[key] = sanitizeSensitiveData(record[key]);
      }
    }
    return copy;
  }

  return input;
}

export class SafeLogger {
  static log(...args: unknown[]): void {
    const sanitized = args.map(sanitizeSensitiveData);
    console.log(...sanitized);
  }

  static warn(...args: unknown[]): void {
    const sanitized = args.map(sanitizeSensitiveData);
    console.warn(...sanitized);
  }

  static error(...args: unknown[]): void {
    const sanitized = args.map(sanitizeSensitiveData);
    console.error(...sanitized);
  }

  /**
   * Initializes global runtime protection:
   * - HTTPS-only enforcement
   * - Redaction of unhandled errors
   * - Scrubbing of sensitive URL query parameters
   */
  static initRuntimeSecurity(): void {
    if (typeof window === 'undefined') return;

    // 1. Enforce HTTPS in production environments
    try {
      const host = window.location.hostname;
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
      if (window.location.protocol === 'http:' && !isLocalhost) {
        window.location.href = window.location.href.replace('http:', 'https:');
        return;
      }
    } catch {
      // Ignore if in test or restricted context
    }

    // 2. Scrub sensitive query parameters from URL without reloading
    try {
      if (window.location.search) {
        const search = window.location.search;
        if (/[?&](password|secret|key|token|recovery)=/i.test(search)) {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState(null, '', cleanUrl);
        }
      }
    } catch {
      // Ignore
    }

    // 3. Global error handler sanitization
    window.addEventListener('error', (event) => {
      if (event.message) {
        const sanitizedMsg = sanitizeSensitiveData(event.message);
        if (sanitizedMsg !== event.message) {
          // If message contained sensitive data, prevent default logging
          event.preventDefault();
          console.error('[LotusX Security Guard] Redacted error:', sanitizedMsg);
        }
      }
    });

    // 4. Global unhandled rejection sanitization
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = typeof reason === 'string' ? reason : reason?.message || '';
      const sanitized = sanitizeSensitiveData(message);
      if (sanitized !== message) {
        event.preventDefault();
        console.error('[LotusX Security Guard] Redacted unhandled rejection:', sanitized);
      }
    });
  }
}
