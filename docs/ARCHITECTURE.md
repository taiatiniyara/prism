# PRISM System Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Database Architecture](#database-architecture)
5. [Application Architecture](#application-architecture)
6. [Security Architecture](#security-architecture)
7. [Data Flow](#data-flow)
8. [API Design](#api-design)
9. [Deployment Architecture](#deployment-architecture)

---

## System Overview

PRISM (Performance Reporting & Information System Management) is a multi-tenant utility benchmarking platform built with modern web technologies. The system enables utilities across regions to enter operational data, track KPIs, and generate insights through integrated Power BI dashboards.

### Key Characteristics
- **Multi-tenant**: Supports multiple utilities with data isolation
- **Role-based**: 10 distinct roles with granular permissions
- **Data-intensive**: Handles complex KPI calculations and bulk data imports
- **Scalable**: Built to support regional expansion
- **Secure**: Enterprise-grade authentication and authorization

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │    Mobile    │  │   Tablet     │          │
│  │   (Next.js)  │  │   (Future)   │  │   (Future)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Next.js 16 App Router                    │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │  UI Pages  │  │ API Routes │  │ Server     │         │  │
│  │  │            │  │            │  │ Components │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────┐         ┌──────────────────────────┐  │
│  │   Better Auth      │         │    Middleware Layer      │  │
│  │   (Magic Links)    │         │   - RBAC Guards          │  │
│  │                    │         │   - Logging              │  │
│  └────────────────────┘         │   - Validation           │  │
│                                  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ SQL/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Supabase Platform                      │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │  │
│  │  │ PostgreSQL │  │   Storage  │  │  Realtime  │         │  │
│  │  │    DB      │  │   (Files)  │  │   (Future) │         │  │
│  │  └────────────┘  └────────────┘  └────────────┘         │  │
│  │         │                                                 │  │
│  │         │ Drizzle ORM                                    │  │
│  │         ▼                                                 │  │
│  │  ┌────────────────────────────────────────┐            │  │
│  │  │         Database Schema                │            │  │
│  │  │  - Organisations  - Data Entries       │            │  │
│  │  │  - Users          - KPIs               │            │  │
│  │  │  - Regions        - Data Labels        │            │  │
│  │  │  - Generators     - Audit Logs         │            │  │
│  │  └────────────────────────────────────────┘            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Power BI API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES LAYER                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │   Power BI     │  │     Email      │  │   Monitoring   │   │
│  │   Embedded     │  │   (Nodemailer) │  │   (Future)     │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.0 | React framework with App Router |
| React | 19.2 | UI library |
| TypeScript | 5.x | Type-safe development |
| Tailwind CSS | 4.x | Utility-first styling |
| Radix UI | Latest | Accessible component primitives |
| Lucide React | Latest | Icon library |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js API Routes | 16.0 | Serverless API endpoints |
| Better Auth | Latest | Authentication with magic links |
| Drizzle ORM | 0.44.7 | Type-safe SQL query builder |
| Nodemailer | 7.0 | Email delivery |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 14+ | Primary database (via Supabase) |
| Supabase | Latest | Backend-as-a-Service |

### External Services
| Service | Purpose |
|---------|---------|
| Power BI Embedded | Dashboard and reporting |
| SendGrid/AWS SES | Transactional emails (future) |

### Development Tools
| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| Drizzle Kit | Database migrations |
| tsx | TypeScript execution |

---

## Database Architecture

### Entity Relationship Overview

```
┌──────────────┐
│   Region     │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│   Country    │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────────┐      ┌──────────────┐
│  Organisation    │◄─────┤    Users     │
│  (Utility)       │ N:M  └──────────────┘
└────┬─────────────┘
     │ 1:N
     ├─────────┬──────────┐
     ▼         ▼          ▼
┌─────────┐┌─────────┐┌──────────┐
│ Service ││Generator││Data Entry│
│  Area   ││         ││          │
└─────────┘└─────────┘└────┬─────┘
                            │
                            ▼
                      ┌──────────┐
                      │   Data   │
                      │  Labels  │
                      └────┬─────┘
                           │
                           ▼
                      ┌──────────┐
                      │   KPIs   │
                      └──────────┘
```

### Core Tables

#### 1. Regional Hierarchy
- **regions**: Top-level geographic divisions
- **countries**: Country-level entities with ISO codes
- **organisations**: Utilities and non-utility organizations
- **service_areas**: Geographic service boundaries
- **generators**: Power generation facilities

#### 2. KPI & Data Structure
- **kpi_definitions**: KPI metadata and formulas
- **data_label_definitions**: Input metrics for KPIs
- **data_entries**: Actual data values submitted by users
- **managed_lists**: Reference data (categories, subcategories, data types)

#### 3. User Management
- **users**: User accounts with auth credentials
- **user_roles**: Role assignments per organization
- **user_organisations**: Many-to-many relationship
- **consultants**: External consultants (stored as JSON in organisations)

#### 4. System Tables
- **audit_logs**: Activity tracking
- **notifications**: User notifications
- **approvals**: Data entry approval workflow

### Data Isolation Strategy

**Multi-tenancy Approach**: Row-level security via organization context
- Each query includes organization_id filter
- Middleware injects organization context from authenticated session
- Database views for cross-organization analytics (BMO only)

### Indexing Strategy

```sql
-- Performance-critical indexes
CREATE INDEX idx_data_entries_org_date ON data_entries(organisation_id, entry_date);
CREATE INDEX idx_users_org_role ON users(organisation_id, role);
CREATE INDEX idx_data_labels_category ON data_label_definitions(category_id, subcategory_id);
CREATE INDEX idx_kpi_category ON kpi_definitions(category_id, subcategory_id);
```

---

## Application Architecture

### Layer Structure

```
app/
├── (auth)/              # Authentication pages
│   ├── login/
│   ├── verify/
│   └── logout/
├── (dashboard)/         # Protected dashboard routes
│   ├── layout.tsx       # Dashboard layout with nav
│   ├── overview/
│   ├── data-entry/      # Data entry workflows
│   ├── reports/         # Power BI embedded
│   └── settings/
└── api/                 # API routes
    ├── auth/
    ├── organisations/
    ├── data-entries/
    ├── kpis/
    └── admin/

lib/
├── db/
│   ├── connection.ts    # Database client
│   ├── schema/          # Drizzle schema definitions
│   └── migrations/      # Database migrations
├── auth/
│   ├── config.ts        # Better Auth configuration
│   └── middleware.ts    # Auth guards
├── rbac/
│   ├── permissions.ts   # Permission definitions
│   └── guards.ts        # Role-based guards
├── utils/
│   ├── validators.ts    # Input validation
│   ├── calculators.ts   # KPI calculations
│   └── formatters.ts    # Data formatting
└── types/               # TypeScript types

components/
├── ui/                  # Shadcn/Radix components
├── forms/               # Form components
│   ├── data-entry/
│   └── dynamic-form/
├── layouts/
│   ├── dashboard-layout/
│   └── auth-layout/
└── features/            # Feature-specific components
    ├── power-bi/
    ├── user-management/
    └── approval-workflow/
```

### Design Patterns

#### 1. Server Components (Default)
```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  const data = await fetchDashboardData();
  return <DashboardView data={data} />;
}
```

#### 2. API Route Handlers
```typescript
// app/api/organisations/route.ts
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  
  const orgs = await db.query.organisations.findMany({
    where: hasAccess(session.user),
  });
  
  return Response.json(orgs);
}
```

#### 3. RBAC Middleware
```typescript
// lib/rbac/guards.ts
export function requireRole(...roles: Role[]) {
  return async (request: NextRequest) => {
    const session = await getSession();
    if (!roles.includes(session.user.role)) {
      return forbidden();
    }
  };
}
```

#### 4. Form Handling with Server Actions
```typescript
// app/data-entry/actions.ts
'use server';

export async function submitDataEntry(formData: FormData) {
  const session = await getSession();
  // Validation
  // Business logic
  // Database insert
  revalidatePath('/data-entry');
}
```

---

## Security Architecture

### Authentication Flow

```
1. User enters email
2. System generates magic link token
3. Email sent with link
4. User clicks link
5. Token validated
6. Session created
7. User redirected to dashboard
```

### Authorization Model

#### Permission Matrix

| Role | Data Entry | Approve | View Dashboard | Manage Users | System Admin |
|------|------------|---------|----------------|--------------|--------------|
| SA   | ✓         | ✓       | ✓              | ✓            | ✓            |
| BMO  | ✓         | ✓       | ✓              | ✓            | ✓            |
| BLO  | ✓         | ✓       | ✓              | ✓ (Utility)  | ✗            |
| DAO  | ✓*        | ✗       | ✗              | ✗            | ✗            |
| CEO  | ✗         | ✓       | ✓              | ✗            | ✗            |
| CON  | ✓*        | ✗       | ✓              | ✗            | ✗            |
| AFF  | ✗         | ✗       | ✓              | ✗            | ✗            |
| ALL  | ✗         | ✗       | ✓              | ✗            | ✗            |
| MGR  | ✗         | ✗       | ✓ (Read)       | ✗            | ✗            |
| EXE  | ✗         | ✗       | ✓ (Read)       | ✗            | ✗            |

*DAO: Limited to assigned data label categories
*CON: Limited to assigned utilities

### Data Protection

1. **Encryption**
   - TLS 1.3 for data in transit
   - Database encryption at rest (Supabase)
   - Sensitive fields encrypted (PII)

2. **Input Validation**
   - Zod schemas for type validation
   - SQL injection prevention via Drizzle ORM
   - XSS protection via React escaping
   - CSRF tokens for mutations

3. **Audit Trail**
   - All data modifications logged
   - User activity tracking
   - Approval workflow history
   - Failed authentication attempts

---

## Data Flow

### Data Entry Flow

```
┌─────────┐
│  User   │
│ (DAO)   │
└────┬────┘
     │
     │ 1. Navigate to Data Entry
     ▼
┌──────────────────┐
│  Data Entry UI   │
│  - Select Period │
│  - Select Category
└────┬─────────────┘
     │
     │ 2. Load Data Labels
     ▼
┌──────────────────┐
│  Dynamic Form    │
│  Generated based │
│  on Data Labels  │
└────┬─────────────┘
     │
     │ 3. Submit Data
     ▼
┌──────────────────┐
│  Validation      │
│  - Type check    │
│  - Range check   │
│  - Required fields
└────┬─────────────┘
     │
     │ 4. Save Draft/Submit
     ▼
┌──────────────────┐
│   Database       │
│   data_entries   │
│   status: draft  │
└────┬─────────────┘
     │
     │ 5. Request Approval
     ▼
┌──────────────────┐
│   CEO Notified   │
│   Approval Queue │
└────┬─────────────┘
     │
     │ 6. Approve/Reject
     ▼
┌──────────────────┐
│   KPI Engine     │
│   Calculate KPIs │
│   Update Dashboard
└──────────────────┘
```

### Excel Upload Flow

```
User uploads Excel → File validation → Parse spreadsheet
                                            │
                                            ▼
                            Map columns to data labels
                                            │
                                            ▼
                            Validate each row
                                            │
                         ┌──────────────────┴───────────────┐
                         │                                  │
                    ✓ Valid                           ✗ Invalid
                         │                                  │
                         ▼                                  ▼
                Bulk insert to DB                  Return error report
                         │                                  │
                         ▼                                  │
                Send to approval                            │
                                                            │
                         └──────────────────────────────────┘
                                            │
                                            ▼
                                 User corrects & resubmits
```

---

## API Design

### RESTful Conventions

```
GET    /api/organisations          # List organisations
GET    /api/organisations/:id      # Get single organisation
POST   /api/organisations          # Create organisation
PUT    /api/organisations/:id      # Update organisation
DELETE /api/organisations/:id      # Delete organisation

# Nested resources
GET    /api/organisations/:id/users           # Organisation users
POST   /api/organisations/:id/generators      # Add generator
GET    /api/data-entries?org_id=:id&month=:m  # Query data entries
```

### Response Format

```typescript
// Success
{
  success: true,
  data: { ... },
  meta: {
    timestamp: "2025-11-12T10:00:00Z",
    requestId: "req_123"
  }
}

// Error
{
  success: false,
  error: {
    code: "UNAUTHORIZED",
    message: "You don't have permission to access this resource",
    details: { ... }
  }
}
```

### Authentication

```
Authorization: Bearer <session_token>
```

---

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────┐
│           Vercel Platform           │
│  ┌─────────────────────────────┐   │
│  │   Next.js Application       │   │
│  │   - Edge Functions          │   │
│  │   - Serverless Functions    │   │
│  │   - Static Assets (CDN)     │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
                │
                ├──────────► Supabase (Database)
                ├──────────► Power BI Embedded API
                └──────────► Email Service (SMTP)

Environment Variables:
- DATABASE_URL
- BETTER_AUTH_SECRET
- POWER_BI_CLIENT_ID
- SMTP_HOST, SMTP_USER, SMTP_PASS
```

### Monitoring & Observability

- **Error Tracking**: Vercel Analytics / Sentry (future)
- **Performance**: Core Web Vitals monitoring
- **Logging**: Structured logs with correlation IDs
- **Alerts**: Critical error notifications

### Backup Strategy

- **Database**: Daily automated backups (Supabase)
- **Files**: S3-compatible storage with versioning
- **Configuration**: Version controlled in Git

---

## Scalability Considerations

### Horizontal Scaling
- Stateless Next.js functions scale automatically
- Database connection pooling via Supabase
- CDN for static assets

### Vertical Scaling
- Database: Supabase plan upgrades
- Power BI: Embed capacity scaling

### Caching Strategy
- React Server Components caching
- API response caching (SWR/React Query)
- Database query caching (Drizzle)

---

## Future Architecture Enhancements

1. **Microservices**: Extract heavy KPI calculations to separate service
2. **Message Queue**: Async job processing (Excel imports, calculations)
3. **Real-time**: WebSocket support for live collaboration
4. **GraphQL**: Consider GraphQL API for complex queries
5. **Mobile API**: Dedicated API gateway for mobile apps

---

*Last Updated: November 12, 2025*
