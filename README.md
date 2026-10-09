# LotusX Password Vault

LotusX is a client-side, local-first password manager and credential vault built with React 19, TypeScript, Vite, Tailwind CSS 4, IndexedDB, and the Web Cryptography API. All encryption, key derivation, password health auditing, and TOTP generation run locally in the browser with no backend server storing plaintext credentials.

---

## Core Features

- **Client-Side Authenticated Encryption (AES-256-GCM)**:
  - Vault records are encrypted individually in the browser using 256-bit keys and fresh 96-bit (12-byte) random nonces via `window.crypto.subtle`.
  - Ciphertext integrity is protected by 128-bit GCM authentication tags.
- **Argon2id Memory-Hard Key Derivation**:
  - Master Passwords and Emergency Recovery Keys derive 256-bit wrapping keys via WebAssembly-accelerated Argon2id (`hash-wasm`) with per-vault 16-byte CSPRNG salts.
  - Configurable KDF security profiles (`standard`: 32 MB / 3 iterations, `high`: 64 MB / 3 iterations).
- **Key Hierarchy & Non-Extractable Keys**:
  - A random 256-bit Vault Key ($K_{vault}$) encrypts vault records and is wrapped independently by both the Master Key ($K_{master}$) and the 160-bit Emergency Recovery Key ($K_{recovery}$).
  - Active `CryptoKey` instances are imported with `extractable: false`, and temporary key buffers are zeroized after use.
- **High-Capacity IndexedDB Storage**:
  - Encrypted records and vault metadata are persisted in IndexedDB (`lotusx_secure_vault_v1`) with storage durability diagnostics and persistent storage requests (`navigator.storage.persist()`).
- **Built-In TOTP Authenticator (RFC 6238)**:
  - Generates live 6–8 digit 2FA codes (`SHA-1`, `SHA-256`, `SHA-512`) from Base32 secrets or `otpauth://` URIs.
- **CSPRNG Password & Diceware Passphrase Generator**:
  - Rejection-sampled `window.crypto.getRandomValues()` generator with zero modulo bias and real-time entropy estimation.
- **Local Password Health & Hygiene Center**:
  - Offline analysis detecting weak passwords, reused credentials across accounts, and passwords unchanged for over a year.
- **Authenticated Encrypted Backups (`.vault`), CSV Import/Export & Disaster Recovery**:
  - Exports and restores `LOTUSX_AUTHENTICATED_BACKUP_V3` envelopes protected with HKDF-SHA256 derived HMAC tags.
  - Printable **Emergency Recovery Kit** with compressed encrypted QR codes (`pako` + `qrcode.react`) and camera/image QR scanning (`jsqr`).
  - Optional client-side **Google Drive Backup Sync** using the restricted `drive.file` scope; backups are encrypted locally before upload.
  - RFC 4180 CSV importer/exporter with spreadsheet formula-injection (DDE) sanitization and duplicate filtering.
- **WebAuthn Biometric Unlock**:
  - Optional hardware platform authenticator unlock (Touch ID, Face ID, Windows Hello, Android Biometrics) wrapping the vault key locally.
- **Installable Offline-Ready PWA**:
  - Service worker precaching, Web App Manifest, and automatic update notifications.

---

## Technology Stack

- **Frontend**: React 19, TypeScript 5.8, Tailwind CSS 4
- **Build & PWA**: Vite 6, `vite-plugin-pwa` (Workbox)
- **Cryptography**: Web Cryptography API (`AES-256-GCM`, `HKDF-SHA256`, `HMAC`, `CSPRNG`), `hash-wasm` (`Argon2id`)
- **Storage**: IndexedDB (`IndexedDBStore` + `UnifiedSecureStorageService`)
- **Backup & QR Utilities**: `pako` (Deflate/Inflate compression), `qrcode.react`, `jsqr`
- **Cloud Backup Integration**: Google Identity Services / Firebase Google Auth (`drive.file` scope)

---

## Repository Structure

```text
├── public/                     # Static PWA icons, SVG brand mark, and avatar assets
├── scripts/
│   ├── generate-icons.mjs      # Generates PWA icons from public/icon.svg
│   ├── run-all-tests.ts        # Headless runner for the cryptographic & security test suite
│   ├── security-scan.mjs       # Static scanner for hardcoded secrets and unsafe patterns
│   └── verify-lockfile.mjs     # Validates dependency lockfile integrity and HTTPS registry URLs
├── src/
│   ├── components/
│   │   ├── auth/               # Welcome, Create Vault, and Unlock Vault screens
│   │   ├── common/             # Modal, Brand Logo, Splash Screen, Update Banner
│   │   ├── generator/          # CSPRNG Password & Passphrase Generator view
│   │   ├── layout/             # Header and responsive Sidebar navigation
│   │   ├── mobile/             # PWA install prompt banner and installation guide modal
│   │   ├── recovery/           # Emergency Recovery Kit QR generator, QR scanner, Google Drive modal
│   │   ├── security/           # Security Center health audit and self-audit runner views
│   │   ├── settings/           # Security, Storage, Backup, and Appearance settings
│   │   └── vault/              # Dashboard, Record List, Record Detail, Record Edit Modal, Categories
│   ├── context/                # VaultContext and ThemeContext providers
│   ├── core/                   # Application constants and typed error classes
│   ├── hooks/                  # useBackHandler, usePWAInstall, useAppUpdate
│   ├── security/               # Encryption, Argon2id KDF, TOTP, Biometrics, Clipboard, Health, Test Suite
│   ├── services/               # Google Drive backup sync, Emergency Recovery Kit, Navigation service
│   ├── storage/                # IndexedDB store, VaultRepository, BackupService, SearchService
│   ├── types/                  # TypeScript interfaces for vault records, auth, storage, and themes
│   ├── utils/                  # WCAG contrast evaluation and CSS variable theme application
│   ├── App.tsx                 # Root application shell and view router
│   └── main.tsx                # Application entry point and runtime security initialization
├── SECURITY.md                 # Cryptographic architecture, threat model, and disclosure policy
├── vercel.json                 # Vercel SPA routing and production security headers
└── vite.config.ts              # Vite build, PWA manifest, and CSP configuration
```

---

## Prerequisites

- **Node.js**: v20+ (or **Bun** v1.1+)
- A modern browser with Web Cryptography API, WebAssembly, and IndexedDB support.

---

## Installation & Local Development

1. **Install dependencies**:
   ```bash
   npm install
   # or with Bun:
   bun install
   ```

2. **Configure environment variables (optional)**:
   Copy `.env.example` to `.env.local` if you want to configure a custom Google OAuth Client ID for Google Drive backups:
   ```bash
   cp .env.example .env.local
   ```
   Set `VITE_GOOGLE_CLIENT_ID` to your Google Cloud OAuth 2.0 Web Client ID (authorized for `https://www.googleapis.com/auth/drive.file`). No client secret is used or required.

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The app runs on `http://localhost:3000`.

4. **Build and preview production bundle**:
   ```bash
   npm run build
   npm run preview
   ```

---

## Testing & Security Verification

Run the built-in verification and security checks:

```bash
# TypeScript type-checking
npm run lint

# Cryptographic, CRUD, backup, tamper-resistance, and recovery test suite
npm run test

# Static secret and unsafe code pattern scanner
npm run security:scan

# Lockfile integrity & HTTPS resolution check
npm run security:lockfile

# Dependency vulnerability audit
npm run security:audit

# Run all checks together
npm run security:check
```

---

## Deployment (Vercel)

LotusX is preconfigured for static SPA deployment on Vercel via `vercel.json`:

1. Import the repository into Vercel.
2. Framework Preset: **Vite** (`npm run build`, output directory `dist`).
3. (Optional) Add `VITE_GOOGLE_CLIENT_ID` in Vercel Project Settings → Environment Variables.
4. Deploy. `vercel.json` automatically configures `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.

---

## Security Limitations & Responsible Disclosure

- **Zero-Knowledge Recovery Responsibility**: Because LotusX never transmits your Master Password or unencrypted Vault Key to any server, losing both your Master Password and your Emergency Recovery Key / `.vault` backup means your data cannot be recovered.
- **Host & Browser Environment**: Client-side web cryptography protects data at rest and in transit, but cannot defend against a compromised operating system, hardware keyloggers, or malicious browser extensions with broad DOM access.
- For full architectural details and vulnerability reporting instructions, see [SECURITY.md](./SECURITY.md).
