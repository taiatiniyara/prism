# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in PRISM, please email the development team at security@prism-app.dev. Do not create a public GitHub issue.

We aim to acknowledge reports within 48 hours and provide a timeline for a fix within 5 business days. Critical vulnerabilities are prioritized for immediate remediation.

## Supported Versions

Only the latest release (`main` branch) receives security updates. Previous versions are not supported.

| Version | Supported |
|---------|-----------|
| main    | Yes |
| < main  | No  |

## Security Practices

- API keys are compared using timing-safe comparison (crypto.timingSafeEqual)
- All user authentication is handled via Better Auth with rate limiting
- Database credentials are never exposed to the client
- SQL injection is prevented via Drizzle ORM parameterized queries
- XSS protection is handled by React and Next.js defaults
- Secrets are stored in environment variables, never committed to the repository
