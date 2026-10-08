# Security Policy & Architecture

## Security Philosophy & Core Principles

LotusX is built on a strict **zero-knowledge, client-side, local-first** security model. All cryptographic transformations occur exclusively in the client's browser using the standardized W3C Web Cryptography API (`window.crypto.subtle`) and WebAssembly-accelerated Argon2id.

No plaintext credentials, master passwords, recovery keys, or cryptographic keys are ever transmitted across a network, logged to consoles, written to unencrypted storage, or exposed to third-party services.

---

## 1. Cryptographic Architecture

### Key Derivation (`KDF`)
- **Algorithm**: Argon2id (hybrid memory-hard KDF resistant to GPU and ASIC cracking attacks).
- **Adaptive & Versioned Parameters**: KDF parameters (`memorySize`, `iterations`, `parallelism`, `salt`, `hashLength`) are generated per-vault, embedded within authenticated `VaultMetadata`, and versioned. Profiles range from standard (e.g., 64MB memory, 4 iterations) to high-security (e.g., 128MB memory, 8 iterations) based on client capabilities and user configuration.
- **Salt Generation**: 16-byte cryptographically secure random salt generated via `window.crypto.getRandomValues`.
- **Output**: 256-bit symmetric key (`AES-GCM`) and non-extractable HKDF key.

### Key Hierarchy & Separation of Concerns
1. **Master Password Key ($K_{master}$)**: Derived from the user's master password via Argon2id. Never stored on disk; used solely to wrap/unwrap the Vault Key.
2. **Emergency Recovery Key ($K_{recovery}$)**: Derived from a 160-bit (20-byte) CSPRNG-generated hex token formatted as a 5-group alphanumeric recovery string. Unwraps the identical Vault Key independently.
3. **Vault Key ($K_{vault}$)**: A cryptographically random 256-bit symmetric key generated via `window.crypto.getRandomValues`. All vault credentials and records are encrypted with $K_{vault}$.
4. **Non-Extractable CryptoKey Protections & Limitations**:
   - **Protections**: $K_{vault}$ is imported into the browser's WebCrypto context with `{ extractable: false }`. This provides strong defense-in-depth against accidental serialization, logging, `JSON.stringify`, `postMessage` leakage, and automated memory scraping scripts that target JavaScript heap strings and byte buffers.
   - **Realistic Limitations**: Non-extractability **cannot** prevent arbitrary code execution (XSS) within the same execution context. If an attacker achieves arbitrary script execution while the vault is unlocked, they can invoke `window.crypto.subtle.decrypt` or `saveRecord` using the active in-memory `CryptoKey` reference. Defense against this threat relies on a strict zero-inline Content Security Policy, dependency auditing, and automatic inactivity vault locking.
5. **Memory Zeroization**: Intermediate plaintext buffers, raw key arrays, and derivation buffers are immediately overwritten with zeros (`Uint8Array.fill(0)`) using `encryptionService.zeroize()`.

### Symmetric Encryption & Authenticated Data
- **Algorithm**: AES-256-GCM (Galois/Counter Mode).
- **IV / Nonce**: 12-byte (96-bit) cryptographically secure random nonce generated per encryption operation via `window.crypto.getRandomValues`. IVs are never reused.
- **Authentication Tag**: 128-bit authentication tag appended to every ciphertext to prevent chosen-ciphertext attacks (CCA) and detect any tampering.

### Authenticated Backups
- **Format**: `LOTUSX_AUTHENTICATED_BACKUP_V3` with canonical envelope representation (with full backward compatibility for legacy v2 envelopes).
- **HKDF-SHA-256 Authentication**: HMAC-SHA256 tag computed over canonical envelope data. The HMAC key is derived directly from the secret Vault Key ($K_{vault}$) using standard RFC 5869 HKDF-SHA-256 with a fresh 32-byte CSPRNG salt and domain-separated context string (`LOTUSX_AUTHENTICATED_BACKUP_HMAC_V3`). The HMAC key is never derived from public metadata. An attacker possessing only the backup file cannot forge a valid HMAC tag without authenticating with the master password or recovery key.
- **Integrity Validation**: Backups undergo two-stage verification: full SHA-256 digest checks and authenticated HMAC verification. Corrupted records or invalid version tags result in atomic rejection with no storage mutation.

### Formula Injection (CSV DDE) Defense
- All plaintext CSV exports sanitize formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`, `|`, `%`) by prepending a single quote (`'`), neutralizing dynamic data exchange (DDE) exploitation in spreadsheet software.
- CSV imports enforce strict 10MB limits, 10,000 record limits, prototype pollution header checks (`__proto__`, `constructor`, `prototype`), and strip control characters and null bytes.

---

## 2. Threat Model

### Threats Mitigated
| Threat Vector | Mitigation Strategy |
| :--- | :--- |
| **Local Storage Snooping** | All records and vault keys are stored as AES-256-GCM ciphertexts. |
| **Ciphertext Bit-Flipping / Tampering** | AES-256-GCM authentication tags detect any modified bit; tampered records are quarantined with user warnings. |
| **Backup Forgery / Alteration** | Backup HMAC-SHA256 key is derived from secret $K_{vault}$ via HKDF-SHA-256; unauthenticated attackers cannot forge integrity tags. |
| **Cross-Origin Storage Poisoning** | Storage operations target only LotusX-namespaced storage keys; `localStorage.clear()` is banned. |
| **Memory Scraping / Accidental Export** | Cryptographic keys are marked `extractable: false`; raw buffers are zeroized immediately. |
| **Accidental Secret Leakage** | `SafeLogger` redacts keys, passwords, and tokens from console methods and unhandled exceptions. |
| **Protocol Downgrade / MIME Sniffing** | HSTS `max-age=63072000; includeSubDomains; preload` and `X-Content-Type-Options: nosniff`. |

### Realistic Threat Model & Security Boundaries

#### 1. Local Storage Trade-offs
- **Encrypted at Rest**: LotusX stores all vault records, encrypted master key wrappers, and recovery envelopes in browser local storage (`localStorage` / IndexedDB). Every sensitive entry is encrypted with authenticated AES-256-GCM.
- **Physical Device Access**: If an attacker gains physical or filesystem access to the client machine's raw browser storage directories while the vault is locked, they only obtain AES-256-GCM ciphertexts and the Argon2id salt. Offline dictionary or brute-force attacks against the master password require overcoming Argon2id's memory-hard computational cost.
- **Storage Deletion & Quotas**: Local browser storage is subject to client-initiated cache eviction or browser profile deletion. LotusX provides authenticated `.vault` backup exports and import validation to ensure users maintain disaster recovery backups outside the browser sandbox.

#### 2. Browser Extensions vs. Web Applications
- **DOM & Storage Privileges**: Browser extensions with broad permissions (`<all_urls>`, `activeTab`, or `tabs`) operate with elevated privileges outside the standard Same-Origin Policy. Malicious or compromised browser extensions can read DOM inputs or intercept clipboard content regardless of web application defenses.
- **Defense in Depth**: To mitigate peripheral risk, LotusX implements automatic clipboard clearing (configurable 30-second timer), auto-locking after inactivity, zero-inline script Content Security Policy, and enforces standard password field masking. Users must ensure that extensions installed on their browser profiles come from trusted sources.

#### 3. Out of Scope / Environmental Assumptions
- Malware, keyloggers, or memory dumpers running directly on the host operating system with administrative/root privileges.
- Compromised browser binaries, malicious browser extensions with broad DOM/storage permissions, or physical hardware compromise.
- Compromised master passwords whose entropy is too low to withstand targeted dictionary attacks.

---

## 3. Production Security Headers

The application implements defensive security headers across HTTP headers and HTML meta tags:

- **Content-Security-Policy (CSP)**:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
- **Strict-Transport-Security (HSTS)**:
  `max-age=63072000; includeSubDomains; preload`
- **X-Content-Type-Options**:
  `nosniff`
- **Referrer-Policy**:
  `no-referrer`
- **Permissions-Policy**:
  `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), display-capture=(), magnetometer=(), gyroscope=(), accelerometer=()`
- **Cross-Origin-Opener-Policy & Cross-Origin-Resource-Policy**:
  `same-origin`

---

## 4. Automated Security Verification

The repository includes automated security verification scripts executable via npm:

```bash
# Run complete verification suite:
npm run security:check

# Individual audit checks:
npm run lint               # Static TypeScript type check
npm run security:scan       # Static secret and unsafe pattern scanner
npm run security:lockfile   # Dependency lockfile integrity and HTTPS resolution validator
npm run security:audit      # Automated npm package vulnerability scanner
```

---

## 5. Vulnerability Disclosure & Reporting

We take the security of LotusX very seriously. If you discover a vulnerability, please report it responsibly:

### Reporting Process
1. **Do NOT** open a public GitHub issue or discuss the issue publicly.
2. Email your detailed findings to: `security@lotusx.local` (or the project maintainer).
3. Include the following details:
   - Description of the vulnerability and attack vector.
   - Proof of Concept (PoC) or reproduction steps.
   - Assessment of potential impact.

### Response Timelines
- **Initial Acknowledgment**: Within 24 hours of receipt.
- **Triage & Assessment**: Within 72 hours.
- **Fix & Disclosure**: Coordinated release within 14 days or as mutually agreed upon.
