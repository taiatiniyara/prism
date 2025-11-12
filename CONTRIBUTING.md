# PRISM - Contributing Guide

## Welcome!

Thank you for your interest in contributing to PRISM. This guide will help you get started with development, understand our workflow, and make your first contribution.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Git Workflow](#git-workflow)
6. [Testing](#testing)
7. [Pull Request Process](#pull-request-process)
8. [Code Review Guidelines](#code-review-guidelines)

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Git**: Latest version
- **Supabase Account**: For database access
- **VS Code**: Recommended IDE (optional)

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/taiatiniyara/prism.git
cd prism
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]

# Authentication
BETTER_AUTH_SECRET=your_secret_key_here
BETTER_AUTH_URL=http://localhost:3000

# Email (Development)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
SMTP_FROM=noreply@prism.local

# Power BI (if testing dashboard)
POWER_BI_CLIENT_ID=your_powerbi_client_id
POWER_BI_CLIENT_SECRET=your_powerbi_client_secret
POWER_BI_TENANT_ID=your_tenant_id
```

### 4. Database Setup

```bash
# Push schema to database
npm run db-push

# Run seed script (if available)
npx tsx scripts/seed.ts
```

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## Project Structure

```
prism/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
│
├── components/            # React components
│   ├── ui/               # Shadcn/Radix UI components
│   ├── forms/            # Form components
│   ├── layouts/          # Layout components
│   └── features/         # Feature-specific components
│
├── lib/                   # Shared utilities
│   ├── db/               # Database configuration
│   │   ├── schema/       # Drizzle schema definitions
│   │   ├── connection.ts # DB client
│   │   └── config.ts     # Drizzle config
│   ├── auth/             # Authentication utilities
│   ├── rbac/             # Role-based access control
│   ├── utils/            # Helper functions
│   └── types/            # TypeScript types
│
├── docs/                  # Documentation
├── public/                # Static assets
├── scripts/               # Utility scripts
│
└── Configuration Files
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── eslint.config.mjs
```

---

## Coding Standards

### TypeScript

- **Always use TypeScript**: No `.js` or `.jsx` files
- **Explicit types**: Prefer explicit types over `any`
- **Type inference**: Use when types are obvious
- **Interfaces vs Types**: Use `interface` for objects, `type` for unions/intersections

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  role: Role;
}

type Role = 'SA' | 'BMO' | 'BLO' | 'DAO';

// ❌ Bad
const user: any = { ... };
```

### Naming Conventions

- **Files**: `kebab-case.tsx` (e.g., `data-entry-form.tsx`)
- **Components**: `PascalCase` (e.g., `DataEntryForm`)
- **Functions**: `camelCase` (e.g., `fetchUserData`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
- **Types/Interfaces**: `PascalCase` (e.g., `UserProfile`)

### Component Structure

```typescript
// 1. Imports (grouped)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fetchData } from '@/lib/utils';
import type { User } from '@/lib/types';

// 2. Types/Interfaces
interface DataEntryFormProps {
  userId: string;
  onSubmit: (data: FormData) => void;
}

// 3. Component
export function DataEntryForm({ userId, onSubmit }: DataEntryFormProps) {
  const [loading, setLoading] = useState(false);

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    // ...
  };

  // Render
  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  );
}

// 4. Helper functions (if needed)
function validateData(data: unknown): boolean {
  // ...
}
```

### React Best Practices

1. **Use Server Components by default**
   ```typescript
   // app/dashboard/page.tsx
   export default async function DashboardPage() {
     const data = await fetchData();
     return <DashboardView data={data} />;
   }
   ```

2. **Client Components only when needed**
   ```typescript
   'use client';
   
   import { useState } from 'react';
   
   export function InteractiveForm() {
     const [value, setValue] = useState('');
     // ...
   }
   ```

3. **Server Actions for mutations**
   ```typescript
   'use server';
   
   export async function createEntry(formData: FormData) {
     // Validation
     // Database operation
     // Revalidate cache
   }
   ```

### CSS/Styling

- **Tailwind CSS**: Use Tailwind utility classes
- **Component variants**: Use `class-variance-authority` (CVA)
- **Avoid inline styles**: Prefer Tailwind classes

```typescript
// ✅ Good
<div className="flex items-center gap-4 p-4 rounded-lg bg-slate-100">
  <Button variant="primary" size="lg">Submit</Button>
</div>

// ❌ Bad
<div style={{ display: 'flex', padding: '16px' }}>
  <button>Submit</button>
</div>
```

### Database Queries

- **Use Drizzle ORM**: Never write raw SQL
- **Type-safe queries**: Leverage Drizzle's type inference
- **Avoid N+1 queries**: Use joins or batch fetching

```typescript
// ✅ Good
const users = await db.query.users.findMany({
  where: eq(users.organisation_id, orgId),
  with: {
    organisation: true,
  },
});

// ❌ Bad
const users = await db.select().from(users);
for (const user of users) {
  const org = await db.query.organisations.findFirst({
    where: eq(organisations.id, user.organisation_id),
  });
}
```

---

## Git Workflow

### Branch Naming

- **Features**: `feature/short-description`
- **Bug fixes**: `fix/bug-description`
- **Hotfixes**: `hotfix/critical-issue`
- **Documentation**: `docs/what-changed`

Examples:
```bash
feature/data-entry-excel-upload
fix/approval-workflow-notification
hotfix/authentication-session-timeout
docs/api-documentation-update
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples**:
```bash
feat(data-entry): add Excel upload functionality

Implemented Excel parser, validation, and bulk import for data entries.
Includes error reporting and import history tracking.

Closes #123

---

fix(auth): resolve session timeout issue

Fixed bug where sessions were expiring prematurely due to incorrect
token refresh logic.

Fixes #456
```

### Workflow Steps

1. **Create a branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

3. **Keep branch updated**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

4. **Push to remote**
   ```bash
   git push origin feature/my-new-feature
   ```

5. **Create Pull Request** on GitHub

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

```typescript
// __tests__/lib/utils/calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateKPI } from '@/lib/utils/calculator';

describe('calculateKPI', () => {
  it('should calculate revenue per customer correctly', () => {
    const result = calculateKPI({
      formula: 'revenue / customers',
      inputs: {
        revenue: 1000000,
        customers: 50000,
      },
    });
    
    expect(result).toBe(20);
  });

  it('should handle division by zero', () => {
    expect(() => {
      calculateKPI({
        formula: 'revenue / customers',
        inputs: { revenue: 1000000, customers: 0 },
      });
    }).toThrow('Division by zero');
  });
});
```

### Testing Checklist

- [ ] Unit tests for utility functions
- [ ] Integration tests for API routes
- [ ] Component tests for UI components
- [ ] E2E tests for critical workflows (if applicable)

---

## Pull Request Process

### Before Creating PR

1. **Ensure all tests pass**
   ```bash
   npm test
   ```

2. **Lint your code**
   ```bash
   npm run lint
   ```

3. **Update documentation** (if needed)

4. **Rebase on main**
   ```bash
   git rebase origin/main
   ```

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed the code
- [ ] Commented complex code
- [ ] Updated documentation
- [ ] No new warnings
- [ ] Added tests
- [ ] All tests pass
- [ ] Dependent changes merged

## Screenshots (if applicable)

## Related Issues
Closes #123
```

### PR Size Guidelines

- **Small**: < 200 lines changed (preferred)
- **Medium**: 200-500 lines
- **Large**: > 500 lines (split if possible)

---

## Code Review Guidelines

### For Authors

- **Keep PRs small and focused**
- **Provide context in description**
- **Respond to feedback promptly**
- **Be open to suggestions**

### For Reviewers

- **Be constructive and kind**
- **Focus on code quality, not style**
- **Approve when ready**, don't block on minor issues
- **Test the changes locally** if complex

### Review Checklist

- [ ] Code follows project standards
- [ ] Logic is sound and efficient
- [ ] Edge cases are handled
- [ ] Tests are adequate
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance is acceptable

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Better Auth Docs](https://www.better-auth.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Questions?

If you have questions or need help:

1. Check existing documentation
2. Search GitHub Issues
3. Ask in team chat/Discord
4. Create a new issue with the `question` label

---

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Report unacceptable behavior

---

Thank you for contributing to PRISM! 🚀

*Last Updated: November 12, 2025*
