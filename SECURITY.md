# Security Policy

Caribe handles money. We take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead, report privately via
GitHub Security Advisories (the **Security** tab → *Report a vulnerability*), or email the
maintainer. Include steps to reproduce and impact. We aim to acknowledge within 72 hours.

## Scope

In scope: the application code in this repository (ledger, auth, API, client).

Out of scope (until live): the production Sand Dollar rail and KYC vendor integrations,
which require external credentials and are not active in this codebase.

## Hardening already in place

- Secrets from environment (production refuses to boot without them)
- Per-IP rate limiting + account lockout after repeated bad PINs
- Security headers: CSP (`script-src 'self'`), HSTS, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy
- Atomic double-entry ledger, idempotent transfers, per-currency conservation invariant
- Path-traversal-safe static serving; server code, database, and secrets are never served
- PINs hashed with scrypt; tokens are HMAC-signed with expiry

## Before taking real customer funds

A third-party security audit / penetration test, a money-transmitter license, live rail
credentials, a KYC vendor, and a bank holding the safeguarded reserve are required. These
are organizational/legal controls beyond this codebase.
