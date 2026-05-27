# Security

## Reporting a vulnerability

Please do **not** open public GitHub issues for security vulnerabilities.

Instead, email the maintainer with details of the issue. Include:

- A description of the vulnerability
- Steps to reproduce
- The version / commit you're testing against
- Any proof-of-concept code

The maintainer will acknowledge receipt within a few days and follow up
with a timeline for a fix.

## Scope

Marginalia is self-hosted by each institution. The maintainer is
responsible for vulnerabilities in the code; **each institution is
responsible for vulnerabilities introduced by their deployment**
(misconfigured secrets, exposed admin email lists, weak OAuth client
secret handling, etc.).

In-scope:

- Authentication and session handling (`packages/auth`)
- Authorisation (filter-by-course_id leaks)
- RAG indexing path (SSRF, file-type confusion, vector poisoning)
- D1 schema (SQL injection via the worker)

Out of scope for this codebase but worth reporting to the institution:

- Cloudflare account compromise
- Google OAuth client secret leakage
- LLM provider API key leakage
- Brand overlay repository compromise

## Disclosure

Marginalia is small and pre-1.0; we don't have a CVE issuer set up. Fixes
land as ordinary commits with a security note in the release notes once
the affected institutions have had time to upgrade.
