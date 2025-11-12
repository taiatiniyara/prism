# PRISM Server Actions Documentation

## Overview

PRISM uses Next.js Server Actions for all server-side operations instead of traditional REST API routes. This provides better type safety, automatic request deduplication, and seamless integration with React Server Components.

---

## Authentication

All Server Actions automatically use Supabase Auth session cookies. No need for explicit Authorization headers.

```typescript
// Authentication is handled automatically
const session = await getSession();
if (!session) throw new Error('Unauthorized');
```

---

## Response Format

### Return Values

Server Actions return data directly or throw errors:

```typescript
// Success - returns data
const orgs = await getOrganisations();
// orgs: Organisation[]

// Error - throws exception
try {
  await createOrganisation(formData);
} catch (error) {
  console.error(error.message); // "Unauthorized", "Forbidden", etc.
}
```

### Error Handling

Server Actions throw errors with descriptive messages:

| Error Message | Description |
|---------------|-------------|
| `Unauthorized` | Not authenticated |
| `Forbidden` | Insufficient permissions |
| `Not Found` | Resource not found |
| `Validation Error` | Invalid input data |
| `Duplicate Entry` | Resource conflict |
| `Internal Server Error` | Server error |

```typescript
// Client-side error handling
'use client';

export function MyForm() {
  const [error, setError] = useState<string>();
  
  async function handleSubmit(formData: FormData) {
    try {
      await createOrganisation(formData);
      // Success!
    } catch (err) {
      setError(err.message);
    }
  }
  
  return <form action={handleSubmit}>...</form>;
}
```

---

## Authentication Actions

**File**: `app/actions/auth.ts`

### Send Magic Link

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';

export async function sendMagicLink(email: string) {
  const supabase = createClient();
  
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  
  if (error) throw new Error(error.message);
  
  return { message: `Magic link sent to ${email}` };
}
```

**Usage**:
```typescript
'use client';

async function handleLogin(formData: FormData) {
  const email = formData.get('email') as string;
  await sendMagicLink(email);
  // Show success message
}
```

---

### Logout

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
```

**Usage**:
```typescript
<form action={logout}>
  <button type="submit">Logout</button>
</form>
```

---

### Get Current User

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db/connection';

export async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) throw new Error('Unauthorized');
  
  // Get additional user data from database
  const userData = await db.query.users.findFirst({
    where: eq(users.email, user.email),
    with: {
      organisation: true,
    },
  });
  
  return userData;
}
```

**Usage in Server Component**:
```typescript
export default async function DashboardPage() {
  const user = await getCurrentUser();
  return <div>Welcome, {user.name}!</div>;
}
```

---

## Organisation Actions

**File**: `app/actions/organisations.ts`

### List Organisations

```typescript
'use server';

import { db } from '@/lib/db/connection';
import { requireRole } from '@/lib/rbac/guards';

export async function getOrganisations(filters?: {
  country_id?: string;
  is_utility?: boolean;
  page?: number;
  limit?: number;
}) {
  await requireRole('SA', 'BMO');
  
  const { page = 1, limit = 20, country_id, is_utility } = filters || {};
  const offset = (page - 1) * limit;
  
  let query = db.query.organisations.findMany({
    with: {
      country: true,
    },
    limit,
    offset,
  });
  
  if (country_id) {
    query = query.where(eq(organisations.country_id, country_id));
  }
  
  if (is_utility !== undefined) {
    query = query.where(eq(organisations.is_utility, is_utility));
  }
  
  const orgs = await query;
  const total = await db.select({ count: count() })
    .from(organisations)
    .where(/* same filters */);
  
  return {
    organisations: orgs,
    pagination: {
      page,
      limit,
      total: total[0].count,
      totalPages: Math.ceil(total[0].count / limit),
    },
  };
}
```

**Usage in Server Component**:
```typescript
export default async function OrganisationsPage({ searchParams }) {
  const data = await getOrganisations({
    page: Number(searchParams.page) || 1,
    country_id: searchParams.country,
  });
  
  return <OrganisationsList organisations={data.organisations} />;
}
```

---

### Get Organisation

```typescript
'use server';

export async function getOrganisation(id: string) {
  const session = await requireAuth();
  
  // Check if user has access to this organisation
  if (session.user.role !== 'SA' && session.user.role !== 'BMO') {
    if (session.user.organisation_id !== id) {
      throw new Error('Forbidden');
    }
  }
  
  const org = await db.query.organisations.findFirst({
    where: eq(organisations.id, id),
    with: {
      country: true,
    },
  });
  
  if (!org) throw new Error('Not Found');
  
  // Get stats
  const [userCount, serviceAreaCount, generatorCount] = await Promise.all([
    db.select({ count: count() }).from(users).where(eq(users.organisation_id, id)),
    db.select({ count: count() }).from(serviceAreas).where(eq(serviceAreas.organisation_id, id)),
    db.select({ count: count() }).from(generators).where(eq(generators.organisation_id, id)),
  ]);
  
  return {
    ...org,
    stats: {
      users: userCount[0].count,
      service_areas: serviceAreaCount[0].count,
      generators: generatorCount[0].count,
    },
  };
}
```

---

### Create Organisation

```typescript
'use server';

import { revalidatePath } from 'next/cache';

export async function createOrganisation(formData: FormData) {
  await requireRole('SA', 'BMO');
  
  const name = formData.get('name') as string;
  const acronym = formData.get('acronym') as string;
  const country_id = formData.get('country_id') as string;
  const is_utility = formData.get('is_utility') === 'true';
  
  // Validation
  if (!name || !country_id) {
    throw new Error('Validation Error: name and country_id are required');
  }
  
  const org = await db.insert(organisations).values({
    name,
    acronym,
    country_id,
    is_utility,
  }).returning();
  
  revalidatePath('/organisations');
  return org[0];
}
```

**Usage**:
```typescript
'use client';

export function CreateOrgForm() {
  async function handleSubmit(formData: FormData) {
    try {
      const org = await createOrganisation(formData);
      // Success! Redirect or show message
    } catch (error) {
      // Handle error
    }
  }
  
  return <form action={handleSubmit}>...</form>;
}
```

---

### Update Organisation

```typescript
'use server';

export async function updateOrganisation(id: string, formData: FormData) {
  const session = await requireAuth();
  
  // Check permissions
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (session.user.role !== 'BLO' || session.user.organisation_id !== id) {
      throw new Error('Forbidden');
    }
  }
  
  const updates: Partial<Organisation> = {};
  
  if (formData.has('name')) updates.name = formData.get('name') as string;
  if (formData.has('acronym')) updates.acronym = formData.get('acronym') as string;
  if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true';
  
  const org = await db.update(organisations)
    .set(updates)
    .where(eq(organisations.id, id))
    .returning();
  
  revalidatePath('/organisations');
  revalidatePath(`/organisations/${id}`);
  return org[0];
}
```

---

### Delete Organisation

```typescript
'use server';

export async function deleteOrganisation(id: string) {
  await requireRole('SA', 'BMO');
  
  // Soft delete
  await db.update(organisations)
    .set({ is_active: false })
    .where(eq(organisations.id, id));
  
  revalidatePath('/organisations');
}
```

---

## User Management Actions

**File**: `app/actions/users.ts`

### List Users

```typescript
'use server';

export async function getUsers(filters?: {
  organisation_id?: string;
  role?: string;
  page?: number;
  limit?: number;
}) {
  const session = await requireAuth();
  
  // Permission check
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (session.user.role === 'BLO' && filters?.organisation_id !== session.user.organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  const { page = 1, limit = 20 } = filters || {};
  
  const users = await db.query.users.findMany({
    where: and(
      filters?.organisation_id ? eq(users.organisation_id, filters.organisation_id) : undefined,
      filters?.role ? eq(users.role, filters.role) : undefined
    ),
    with: { organisation: true },
    limit,
    offset: (page - 1) * limit,
  });
  
  return users;
}
```

---

### Create User

```typescript
'use server';

export async function createUser(formData: FormData) {
  const session = await requireAuth();
  
  const email = formData.get('email') as string;
  const name = formData.get('name') as string;
  const role = formData.get('role') as string;
  const organisation_id = formData.get('organisation_id') as string;
  
  // Permission check
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (session.user.role !== 'BLO' || session.user.organisation_id !== organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  // Validation
  if (!email || !name || !role || !organisation_id) {
    throw new Error('Validation Error: All fields are required');
  }
  
  const user = await db.insert(users).values({
    email,
    name,
    role,
    organisation_id,
  }).returning();
  
  revalidatePath('/users');
  return user[0];
}
```

---

### Update User

```typescript
'use server';

export async function updateUser(id: string, formData: FormData) {
  const session = await requireAuth();
  
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  
  if (!user) throw new Error('Not Found');
  
  // Permission check
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (session.user.role !== 'BLO' || session.user.organisation_id !== user.organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  const updates: Partial<User> = {};
  if (formData.has('name')) updates.name = formData.get('name') as string;
  if (formData.has('role')) updates.role = formData.get('role') as string;
  if (formData.has('is_active')) updates.is_active = formData.get('is_active') === 'true';
  
  const updated = await db.update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning();
  
  revalidatePath('/users');
  return updated[0];
}
```

---

### Deactivate User

```typescript
'use server';

export async function deactivateUser(id: string) {
  const session = await requireAuth();
  
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
  });
  
  if (!user) throw new Error('Not Found');
  
  // Permission check
  if (!['SA', 'BMO'].includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  
  await db.update(users)
    .set({ is_active: false })
    .where(eq(users.id, id));
  
  revalidatePath('/users');
}
```

---

## Data Entry Actions

**File**: `app/actions/data-entries.ts`

### List Data Entries

```typescript
'use server';

export async function getDataEntries(filters?: {
  organisation_id?: string;
  year?: number;
  month?: number;
  status?: string;
  data_label_id?: string;
  page?: number;
  limit?: number;
}) {
  const session = await requireAuth();
  
  const { page = 1, limit = 20 } = filters || {};
  
  const entries = await db.query.dataEntries.findMany({
    where: and(
      // Filter by organisation if not SA/BMO
      !['SA', 'BMO'].includes(session.user.role) 
        ? eq(dataEntries.organisation_id, session.user.organisation_id)
        : filters?.organisation_id 
          ? eq(dataEntries.organisation_id, filters.organisation_id)
          : undefined,
      filters?.year ? eq(dataEntries.period_year, filters.year) : undefined,
      filters?.month ? eq(dataEntries.period_month, filters.month) : undefined,
      filters?.status ? eq(dataEntries.status, filters.status) : undefined,
      filters?.data_label_id ? eq(dataEntries.data_label_id, filters.data_label_id) : undefined
    ),
    with: {
      organisation: true,
      dataLabel: true,
      submittedBy: true,
      approvedBy: true,
    },
    limit,
    offset: (page - 1) * limit,
  });
  
  return entries;
}
```

---

### Get Data Entry

```typescript
'use server';

export async function getDataEntry(id: string) {
  const session = await requireAuth();
  
  const entry = await db.query.dataEntries.findFirst({
    where: eq(dataEntries.id, id),
    with: {
      organisation: true,
      dataLabel: true,
      submittedBy: true,
      approvedBy: true,
    },
  });
  
  if (!entry) throw new Error('Not Found');
  
  // Check access
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (entry.organisation_id !== session.user.organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  return entry;
}
```

---

### Create Data Entry

```typescript
'use server';

export async function createDataEntry(formData: FormData) {
  const session = await requireAuth();
  
  const organisation_id = formData.get('organisation_id') as string;
  const data_label_id = formData.get('data_label_id') as string;
  const period_year = Number(formData.get('period_year'));
  const period_month = Number(formData.get('period_month'));
  const value = Number(formData.get('value'));
  const status = (formData.get('status') as string) || 'draft';
  const notes = formData.get('notes') as string;
  
  // Permission check
  if (!['BLO', 'DAO', 'CON'].includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  
  // Validate organisation access
  if (session.user.organisation_id !== organisation_id && session.user.role !== 'CON') {
    throw new Error('Forbidden');
  }
  
  // Validation
  if (!data_label_id || !period_year || !period_month || value === undefined) {
    throw new Error('Validation Error: Required fields missing');
  }
  
  const entry = await db.insert(dataEntries).values({
    organisation_id,
    data_label_id,
    period_year,
    period_month,
    value,
    status,
    notes,
    submitted_by: session.user.id,
  }).returning();
  
  revalidatePath('/data-entry');
  return entry[0];
}
```

---

### Update Data Entry

```typescript
'use server';

export async function updateDataEntry(id: string, formData: FormData) {
  const session = await requireAuth();
  
  const entry = await db.query.dataEntries.findFirst({
    where: eq(dataEntries.id, id),
  });
  
  if (!entry) throw new Error('Not Found');
  
  // Can only update draft entries
  if (entry.status !== 'draft') {
    throw new Error('Cannot update non-draft entries');
  }
  
  // Permission check
  if (entry.submitted_by !== session.user.id && !['BLO', 'CON'].includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  
  const updates: Partial<DataEntry> = {};
  if (formData.has('value')) updates.value = Number(formData.get('value'));
  if (formData.has('notes')) updates.notes = formData.get('notes') as string;
  
  const updated = await db.update(dataEntries)
    .set(updates)
    .where(eq(dataEntries.id, id))
    .returning();
  
  revalidatePath('/data-entry');
  return updated[0];
}
```

---

### Submit Data Entry

```typescript
'use server';

export async function submitDataEntry(id: string) {
  const session = await requireAuth();
  
  const entry = await db.query.dataEntries.findFirst({
    where: eq(dataEntries.id, id),
  });
  
  if (!entry) throw new Error('Not Found');
  if (entry.status !== 'draft') throw new Error('Entry already submitted');
  
  // Permission check
  if (entry.submitted_by !== session.user.id && !['BLO', 'CON'].includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  
  const updated = await db.update(dataEntries)
    .set({
      status: 'submitted',
      submitted_at: new Date(),
    })
    .where(eq(dataEntries.id, id))
    .returning();
  
  // TODO: Notify CEO for approval
  
  revalidatePath('/data-entry');
  return updated[0];
}
```

---

### Approve Data Entry

```typescript
'use server';

export async function approveDataEntry(id: string, notes?: string) {
  const session = await requireRole('CEO');
  
  const entry = await db.query.dataEntries.findFirst({
    where: eq(dataEntries.id, id),
  });
  
  if (!entry) throw new Error('Not Found');
  if (entry.status !== 'submitted') throw new Error('Entry not submitted for approval');
  
  // CEO can only approve for their organisation
  if (entry.organisation_id !== session.user.organisation_id) {
    throw new Error('Forbidden');
  }
  
  const updated = await db.update(dataEntries)
    .set({
      status: 'approved',
      approved_by: session.user.id,
      approved_at: new Date(),
      approval_notes: notes,
    })
    .where(eq(dataEntries.id, id))
    .returning();
  
  // Trigger KPI calculations
  await calculateKPIs(entry.organisation_id, entry.period_year, entry.period_month);
  
  revalidatePath('/data-entry');
  revalidatePath('/approvals');
  return updated[0];
}
```

---

### Reject Data Entry

```typescript
'use server';

export async function rejectDataEntry(id: string, rejection_reason: string) {
  const session = await requireRole('CEO');
  
  const entry = await db.query.dataEntries.findFirst({
    where: eq(dataEntries.id, id),
  });
  
  if (!entry) throw new Error('Not Found');
  if (entry.status !== 'submitted') throw new Error('Entry not submitted for approval');
  
  // CEO can only reject for their organisation
  if (entry.organisation_id !== session.user.organisation_id) {
    throw new Error('Forbidden');
  }
  
  const updated = await db.update(dataEntries)
    .set({
      status: 'rejected',
      rejection_reason,
      rejected_by: session.user.id,
      rejected_at: new Date(),
    })
    .where(eq(dataEntries.id, id))
    .returning();
  
  // TODO: Notify submitter
  
  revalidatePath('/data-entry');
  revalidatePath('/approvals');
  return updated[0];
}
```

---

### Bulk Data Entry

```typescript
'use server';

export async function bulkCreateDataEntries(formData: FormData) {
  const session = await requireAuth();
  
  const organisation_id = formData.get('organisation_id') as string;
  const period_year = Number(formData.get('period_year'));
  const period_month = Number(formData.get('period_month'));
  const entriesJson = formData.get('entries') as string;
  const entries = JSON.parse(entriesJson);
  
  // Permission check
  if (!['BLO', 'DAO', 'CON'].includes(session.user.role)) {
    throw new Error('Forbidden');
  }
  
  const results = [];
  const errors = [];
  
  for (const entry of entries) {
    try {
      const created = await db.insert(dataEntries).values({
        organisation_id,
        data_label_id: entry.data_label_id,
        period_year,
        period_month,
        value: entry.value,
        status: 'draft',
        submitted_by: session.user.id,
      }).returning();
      
      results.push(created[0]);
    } catch (error) {
      errors.push({
        data_label_id: entry.data_label_id,
        error: error.message,
      });
    }
  }
  
  revalidatePath('/data-entry');
  
  return {
    created: results.length,
    failed: errors.length,
    entries: results,
    errors,
  };
}
```

---

## Excel Import Actions

**File**: `app/actions/excel.ts`

### Upload Excel File

```typescript
'use server';

import { parseExcelFile } from '@/lib/excel/parser';

export async function uploadExcelFile(formData: FormData) {
  const session = await requireAuth();
  
  const file = formData.get('file') as File;
  const organisation_id = formData.get('organisation_id') as string;
  const period_year = Number(formData.get('period_year'));
  const period_month = Number(formData.get('period_month'));
  
  if (!file || !organisation_id || !period_year || !period_month) {
    throw new Error('Validation Error: All fields required');
  }
  
  // Create import record
  const importRecord = await db.insert(excelImports).values({
    file_name: file.name,
    organisation_id,
    period_year,
    period_month,
    uploaded_by: session.user.id,
    status: 'processing',
  }).returning();
  
  // Process file in background
  processExcelFile(importRecord[0].id, file, organisation_id, period_year, period_month)
    .catch(console.error);
  
  return {
    import_id: importRecord[0].id,
    status: 'processing',
    file_name: file.name,
  };
}
```

---

### Get Import Status

```typescript
'use server';

export async function getImportStatus(id: string) {
  const session = await requireAuth();
  
  const importRecord = await db.query.excelImports.findFirst({
    where: eq(excelImports.id, id),
  });
  
  if (!importRecord) throw new Error('Not Found');
  
  // Check access
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (importRecord.organisation_id !== session.user.organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  return importRecord;
}
```

---

### Download Template

```typescript
'use server';

import { generateExcelTemplate } from '@/lib/excel/generator';

export async function downloadExcelTemplate(category_id?: string, organisation_id?: string) {
  const session = await requireAuth();
  
  // Get data labels
  const labels = await db.query.dataLabelDefinitions.findMany({
    where: category_id ? eq(dataLabelDefinitions.category_id, category_id) : undefined,
  });
  
  // Generate Excel file
  const buffer = await generateExcelTemplate(labels, organisation_id);
  
  return buffer;
}
```

---

## KPI Actions

**File**: `app/actions/kpis.ts`

### List KPIs

```typescript
'use server';

export async function getKPIs(filters?: {
  category_id?: string;
  subcategory_id?: string;
}) {
  const session = await requireAuth();
  
  const kpis = await db.query.kpiDefinitions.findMany({
    where: and(
      filters?.category_id ? eq(kpiDefinitions.category_id, filters.category_id) : undefined,
      filters?.subcategory_id ? eq(kpiDefinitions.subcategory_id, filters.subcategory_id) : undefined
    ),
    with: {
      category: true,
      subcategory: true,
      inputs: {
        with: {
          dataLabel: true,
        },
      },
    },
  });
  
  return kpis;
}
```

---

### Get KPI Calculations

```typescript
'use server';

export async function getKPICalculations(
  kpi_id: string,
  organisation_id: string,
  year: number,
  month?: number
) {
  const session = await requireAuth();
  
  // Check access
  if (!['SA', 'BMO'].includes(session.user.role)) {
    if (session.user.organisation_id !== organisation_id) {
      throw new Error('Forbidden');
    }
  }
  
  const kpi = await db.query.kpiDefinitions.findFirst({
    where: eq(kpiDefinitions.id, kpi_id),
  });
  
  if (!kpi) throw new Error('Not Found');
  
  const calculations = await db.query.kpiCalculations.findMany({
    where: and(
      eq(kpiCalculations.kpi_id, kpi_id),
      eq(kpiCalculations.organisation_id, organisation_id),
      eq(kpiCalculations.year, year),
      month ? eq(kpiCalculations.month, month) : undefined
    ),
    orderBy: [desc(kpiCalculations.year), desc(kpiCalculations.month)],
  });
  
  return {
    kpi: {
      id: kpi.id,
      name: kpi.name,
      description: kpi.description,
      unit: kpi.unit,
    },
    calculations: calculations.map(calc => ({
      period: {
        year: calc.year,
        month: calc.month,
      },
      value: calc.value,
      metadata: calc.metadata,
    })),
  };
}
```

---

### Create KPI Definition

```typescript
'use server';

export async function createKPI(formData: FormData) {
  await requireRole('SA', 'BMO');
  
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const category_id = formData.get('category_id') as string;
  const subcategory_id = formData.get('subcategory_id') as string;
  const formula = formData.get('formula') as string;
  const unit = formData.get('unit') as string;
  const inputsJson = formData.get('inputs') as string;
  const inputs = JSON.parse(inputsJson);
  
  // Validation
  if (!name || !formula || !inputs.length) {
    throw new Error('Validation Error: Required fields missing');
  }
  
  const kpi = await db.insert(kpiDefinitions).values({
    name,
    description,
    category_id,
    subcategory_id,
    formula,
    unit,
  }).returning();
  
  // Insert inputs
  for (const input of inputs) {
    await db.insert(kpiInputs).values({
      kpi_id: kpi[0].id,
      data_label_id: input.data_label_id,
      variable: input.variable,
    });
  }
  
  revalidatePath('/kpis');
  return kpi[0];
}
```

---

## Data Label Actions

**File**: `app/actions/data-labels.ts`

### List Data Labels

```typescript
'use server';

export async function getDataLabels(filters?: {
  category_id?: string;
  subcategory_id?: string;
}) {
  const session = await requireAuth();
  
  const labels = await db.query.dataLabelDefinitions.findMany({
    where: and(
      filters?.category_id ? eq(dataLabelDefinitions.category_id, filters.category_id) : undefined,
      filters?.subcategory_id ? eq(dataLabelDefinitions.subcategory_id, filters.subcategory_id) : undefined
    ),
    with: {
      category: true,
      subcategory: true,
    },
  });
  
  return labels;
}
```

---

### Create Data Label

```typescript
'use server';

export async function createDataLabel(formData: FormData) {
  await requireRole('SA', 'BMO');
  
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const category_id = formData.get('category_id') as string;
  const subcategory_id = formData.get('subcategory_id') as string;
  const data_type = formData.get('data_type') as string;
  const unit = formData.get('unit') as string;
  const is_required = formData.get('is_required') === 'true';
  
  const label = await db.insert(dataLabelDefinitions).values({
    name,
    description,
    category_id,
    subcategory_id,
    data_type,
    unit,
    is_required,
  }).returning();
  
  revalidatePath('/data-labels');
  return label[0];
}
```

---

## Dashboard Data

**File**: `app/(dashboard)/overview/page.tsx`

### Get Dashboard Data (Server Component)

```typescript
// Server Component - no need for Server Action
export default async function DashboardPage() {
  const session = await requireAuth();
  
  const organisation_id = ['SA', 'BMO'].includes(session.user.role)
    ? null // Show aggregated data
    : session.user.organisation_id;
  
  // Fetch all dashboard data directly
  const [recentEntries, pendingApprovals, kpiSummary, stats] = await Promise.all([
    getRecentDataEntries(organisation_id),
    getPendingApprovals(organisation_id, session.user.role),
    getKPISummary(organisation_id),
    getOrganisationStats(organisation_id),
  ]);
  
  return (
    <DashboardView
      recentEntries={recentEntries}
      pendingApprovals={pendingApprovals}
      kpiSummary={kpiSummary}
      stats={stats}
    />
  );
}
```
```json
{
  "success": true,
  "data": {
    "organisation": {
      "id": "org_123",
      "name": "Kenya Power"
    },
    "summary": {
      "total_entries": 1250,
      "pending_approvals": 15,
      "completion_rate": 85.5,
      "last_submission": "2025-11-10T14:30:00Z"
    },
    "recent_activity": [ ... ],
    "power_bi_reports": [
      {
        "id": "report_123",
        "name": "Monthly Performance",
        "embed_url": "https://app.powerbi.com/..."
      }
    ]
  }
}
```

---

### Get Power BI Embed Token

**POST** `/api/dashboard/power-bi/token`

**Request Body**:
```json
{
  "report_id": "report_123"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "H4sIAAAAAAAEAB...",
    "embed_url": "https://app.powerbi.com/reportEmbed",
    "expires_at": "2025-11-12T11:00:00Z"
  }
}
```

---

## Settings Endpoints

### Get User Settings

**GET** `/api/settings/user`

---

### Update User Settings

**PUT** `/api/settings/user`

**Request Body**:
```json
{
  "notifications": {
    "email": true,
    "in_app": true,
    "frequency": "daily"
  },
  "timezone": "Africa/Nairobi",
  "language": "en"
}
```

---

### Get Organisation Settings

**GET** `/api/settings/organisation`

**Required Role**: BLO, CEO (own org), SA, BMO

---

### Update Organisation Settings

**PUT** `/api/settings/organisation`

**Required Role**: BLO (own org), SA, BMO

---

## Webhooks (Future)

### Register Webhook

**POST** `/api/webhooks`

**Request Body**:
```json
{
  "url": "https://your-app.com/webhook",
  "events": ["data_entry.approved", "data_entry.rejected"],
  "secret": "your_webhook_secret"
}
```

---

## Rate Limiting

- **Anonymous**: 10 requests/minute
- **Authenticated**: 100 requests/minute
- **Admin (SA/BMO)**: 1000 requests/minute

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Response Meta**:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

*Last Updated: November 12, 2025*
