# PRISM Database Schema Documentation

## Overview

This document provides comprehensive documentation for the PRISM database schema. The database is built on PostgreSQL (via Supabase) and uses Drizzle ORM for type-safe queries.

---

## Schema Diagram

```
┌────────────────┐
│  managed_lists │  (Reference Data)
└───────┬────────┘
        │
        │ Referenced by multiple tables
        │
┌───────┴────────────────────────────────────┐
│                                             │
▼                                             ▼
┌────────────────┐      ┌──────────────────────────┐
│    regions     │      │  data_label_definitions  │
└───────┬────────┘      └──────────┬───────────────┘
        │                          │
        │ 1:N                      │ Used in
        ▼                          │
┌────────────────┐                 │
│   countries    │                 │
└───────┬────────┘                 │
        │                          │
        │ 1:N                      │
        ▼                          │
┌─────────────────┐                │
│ organisations   │                │
└────┬────────────┘                │
     │                             │
     │ 1:N                         │
     ├──────────┬────────┬─────────┼────────┐
     ▼          ▼        ▼         ▼        ▼
┌─────────┐┌─────────┐┌────────┐┌────────┐┌──────────┐
│  users  ││ service ││generator││  data  ││   kpi    │
│         ││  areas  ││        ││ entries││definitions
└─────────┘└─────────┘└────────┘└────────┘└──────────┘
```

---

## Table Definitions

### 1. managed_lists

**Purpose**: Centralized reference data for categories, subcategories, and types used throughout the system.

```typescript
{
  id: uuid (PK),
  list_type: varchar,      // e.g., 'region', 'data_label_category', 'kpi_category'
  name: varchar,
  code: varchar,           // Short code for programmatic reference
  parent_id: uuid (FK),    // Self-reference for hierarchical data
  sort_order: integer,
  is_active: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Sample Data**:
```sql
-- Regions
('Southern Africa', 'SAF', 'region')
('East Africa', 'EAF', 'region')
('West Africa', 'WAF', 'region')

-- Data Label Categories
('Financial', 'FIN', 'data_label_category')
('Operational', 'OPS', 'data_label_category')
('Technical', 'TECH', 'data_label_category')

-- KPI Categories
('Performance', 'PERF', 'kpi_category')
('Financial Health', 'FINHEALTH', 'kpi_category')
```

**Indexes**:
- `idx_managed_lists_type` on (list_type)
- `idx_managed_lists_parent` on (parent_id)

---

### 2. countries

**Purpose**: Store country information with ISO codes and regional assignment.

```typescript
{
  id: uuid (PK),
  name: varchar,
  iso_alpha_2: varchar(2),  // e.g., 'ZA', 'KE', 'NG'
  iso_alpha_3: varchar(3),  // e.g., 'ZAF', 'KEN', 'NGA'
  sub_region_id: uuid (FK → managed_lists),
  created_at: timestamp
}
```

**Sample Data**:
```sql
INSERT INTO countries (name, iso_alpha_2, iso_alpha_3, sub_region_id) VALUES
('South Africa', 'ZA', 'ZAF', '<southern_africa_id>'),
('Kenya', 'KE', 'KEN', '<east_africa_id>'),
('Nigeria', 'NG', 'NGA', '<west_africa_id>');
```

**Constraints**:
- Unique constraint on (iso_alpha_2)
- Unique constraint on (iso_alpha_3)

---

### 3. organisations

**Purpose**: Represents utilities and non-utility organizations in the system.

```typescript
{
  id: uuid (PK),
  name: varchar,
  acronym: varchar,
  country_id: uuid (FK → countries),
  is_utility: boolean,              // true for utility companies
  is_active: boolean,
  consultants: json,                // Array of consultant objects
  created_at: timestamp,
  updated_at: timestamp
}
```

**Consultants JSON Structure**:
```typescript
interface Consultant {
  id: string;
  name: string;
  email: string;
  assigned_date: string;
  is_active: boolean;
}
```

**Example**:
```json
{
  "consultants": [
    {
      "id": "cons_001",
      "name": "John Doe",
      "email": "john.doe@consulting.com",
      "assigned_date": "2025-01-15",
      "is_active": true
    }
  ]
}
```

**Indexes**:
- `idx_organisations_country` on (country_id)
- `idx_organisations_is_utility` on (is_utility)

---

### 4. users

**Purpose**: User accounts with authentication and role information.

```typescript
{
  id: uuid (PK),
  email: varchar (unique),
  name: varchar,
  role: varchar,                    // SA, BMO, BLO, DAO, CEO, CON, AFF, ALL, MGR, EXE
  organisation_id: uuid (FK → organisations),
  data_label_categories: json,      // For DAO role - assigned categories
  is_active: boolean,
  email_verified: boolean,
  last_login: timestamp,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Role Enum**:
```typescript
type Role = 
  | 'SA'   // Super Admin
  | 'BMO'  // Benchmarking Officer
  | 'BLO'  // Benchmarking Liaison Officer
  | 'DAO'  // Data Acquisition Officer
  | 'CEO'  // Chief Executive Officer
  | 'CON'  // Consultant
  | 'AFF'  // Affiliate
  | 'ALL'  // Ally
  | 'MGR'  // Manager
  | 'EXE'; // Executive
```

**Data Label Categories (for DAO)**:
```json
{
  "categories": ["FIN", "OPS"]  // DAO assigned to Financial and Operational
}
```

**Indexes**:
- `idx_users_email` on (email)
- `idx_users_org_role` on (organisation_id, role)

---

### 5. service_areas

**Purpose**: Geographic service areas within utility organizations.

```typescript
{
  id: uuid (PK),
  name: varchar,
  code: varchar,
  organisation_id: uuid (FK → organisations),
  description: text,
  population_served: integer,
  geographic_area_km2: decimal,
  is_active: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- `idx_service_areas_org` on (organisation_id)

---

### 6. generators

**Purpose**: Power generation facilities associated with utilities.

```typescript
{
  id: uuid (PK),
  name: varchar,
  code: varchar,
  organisation_id: uuid (FK → organisations),
  service_area_id: uuid (FK → service_areas),
  generator_type: varchar,          // e.g., 'Hydro', 'Thermal', 'Solar'
  capacity_mw: decimal,
  commissioned_date: date,
  is_active: boolean,
  metadata: json,                   // Additional flexible data
  created_at: timestamp,
  updated_at: timestamp
}
```

**Metadata Structure**:
```json
{
  "fuel_type": "Natural Gas",
  "efficiency_rating": 0.85,
  "last_maintenance": "2025-10-01",
  "coordinates": {
    "latitude": -33.9249,
    "longitude": 18.4241
  }
}
```

**Indexes**:
- `idx_generators_org` on (organisation_id)
- `idx_generators_service_area` on (service_area_id)

---

### 7. data_label_definitions

**Purpose**: Defines the input metrics that feed into KPI calculations.

```typescript
{
  id: uuid (PK),
  name: varchar,
  description: text,
  category_id: uuid (FK → managed_lists),
  subcategory_id: uuid (FK → managed_lists),
  data_type_id: uuid (FK → managed_lists),  // 'number', 'currency', 'percentage'
  unit: varchar,                             // e.g., 'kWh', 'USD', '%'
  validation_rules: json,
  is_required: boolean,
  is_active: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Validation Rules**:
```json
{
  "min": 0,
  "max": 1000000,
  "decimal_places": 2,
  "allow_negative": false
}
```

**Example Records**:
```sql
-- Financial Data Label
{
  "name": "Total Revenue",
  "category": "Financial",
  "subcategory": "Income",
  "data_type": "currency",
  "unit": "USD",
  "validation_rules": {"min": 0, "decimal_places": 2}
}

-- Operational Data Label
{
  "name": "Energy Sold",
  "category": "Operational",
  "subcategory": "Distribution",
  "data_type": "number",
  "unit": "kWh",
  "validation_rules": {"min": 0}
}
```

**Indexes**:
- `idx_data_labels_category` on (category_id, subcategory_id)

---

### 8. kpi_definitions

**Purpose**: Defines Key Performance Indicators and their calculation formulas.

```typescript
{
  id: uuid (PK),
  name: varchar,
  description: text,
  category_id: uuid (FK → managed_lists),
  subcategory_id: uuid (FK → managed_lists),
  formula: varchar,                 // e.g., 'revenue / customers'
  inputs: json,                     // Array of required data label IDs
  unit: varchar,
  display_format: varchar,          // e.g., 'percentage', 'currency'
  is_active: boolean,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Inputs Structure**:
```json
{
  "inputs": [
    {
      "id": "dl_001",
      "name": "Total Revenue",
      "variable": "revenue"
    },
    {
      "id": "dl_002",
      "name": "Total Customers",
      "variable": "customers"
    }
  ]
}
```

**Formula Examples**:
```javascript
// Revenue per Customer
"revenue / customers"

// Collection Efficiency
"(collections / billed_amount) * 100"

// System Losses
"((energy_generated - energy_sold) / energy_generated) * 100"
```

**Indexes**:
- `idx_kpi_category` on (category_id, subcategory_id)

---

### 9. data_entries

**Purpose**: Stores actual data values submitted by users.

```typescript
{
  id: uuid (PK),
  organisation_id: uuid (FK → organisations),
  service_area_id: uuid (FK → service_areas),  // Optional
  generator_id: uuid (FK → generators),        // Optional
  data_label_id: uuid (FK → data_label_definitions),
  period_year: integer,
  period_month: integer,
  value: decimal,
  status: varchar,                  // 'draft', 'submitted', 'approved', 'rejected'
  submitted_by: uuid (FK → users),
  submitted_at: timestamp,
  approved_by: uuid (FK → users),
  approved_at: timestamp,
  rejection_reason: text,
  notes: text,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Status Flow**:
```
draft → submitted → approved
                 ↘ rejected → (resubmit as new draft)
```

**Indexes**:
- `idx_data_entries_org_period` on (organisation_id, period_year, period_month)
- `idx_data_entries_status` on (status)
- `idx_data_entries_data_label` on (data_label_id)

**Constraints**:
- Unique constraint on (organisation_id, data_label_id, period_year, period_month, service_area_id, generator_id)
  - Prevents duplicate entries for same metric/period

---

### 10. kpi_calculations

**Purpose**: Stores calculated KPI values based on data entries.

```typescript
{
  id: uuid (PK),
  organisation_id: uuid (FK → organisations),
  kpi_id: uuid (FK → kpi_definitions),
  period_year: integer,
  period_month: integer,
  calculated_value: decimal,
  calculation_metadata: json,       // Stores input values used
  calculated_at: timestamp,
  created_at: timestamp
}
```

**Calculation Metadata**:
```json
{
  "inputs": {
    "revenue": 1000000,
    "customers": 50000
  },
  "formula": "revenue / customers",
  "result": 20.00
}
```

**Indexes**:
- `idx_kpi_calc_org_period` on (organisation_id, period_year, period_month)
- `idx_kpi_calc_kpi` on (kpi_id)

---

### 11. audit_logs

**Purpose**: Comprehensive audit trail for all system activities.

```typescript
{
  id: uuid (PK),
  user_id: uuid (FK → users),
  organisation_id: uuid (FK → organisations),
  action: varchar,                  // 'create', 'update', 'delete', 'approve', 'login'
  entity_type: varchar,             // 'data_entry', 'user', 'organisation'
  entity_id: uuid,
  old_values: json,
  new_values: json,
  ip_address: varchar,
  user_agent: text,
  created_at: timestamp
}
```

**Indexes**:
- `idx_audit_logs_user` on (user_id)
- `idx_audit_logs_entity` on (entity_type, entity_id)
- `idx_audit_logs_created` on (created_at)

---

### 12. notifications

**Purpose**: User notifications for approvals, deadlines, and system alerts.

```typescript
{
  id: uuid (PK),
  user_id: uuid (FK → users),
  type: varchar,                    // 'approval_request', 'deadline', 'system'
  title: varchar,
  message: text,
  action_url: varchar,
  is_read: boolean,
  read_at: timestamp,
  created_at: timestamp
}
```

**Indexes**:
- `idx_notifications_user_read` on (user_id, is_read)

---

### 13. excel_imports

**Purpose**: Track bulk data imports from Excel files.

```typescript
{
  id: uuid (PK),
  organisation_id: uuid (FK → organisations),
  uploaded_by: uuid (FK → users),
  file_name: varchar,
  file_url: varchar,               // Supabase storage URL
  total_rows: integer,
  successful_rows: integer,
  failed_rows: integer,
  error_report: json,
  status: varchar,                 // 'processing', 'completed', 'failed'
  created_at: timestamp,
  completed_at: timestamp
}
```

**Error Report Structure**:
```json
{
  "errors": [
    {
      "row": 5,
      "column": "Total Revenue",
      "value": "invalid",
      "error": "Must be a number"
    }
  ]
}
```

---

## Database Migrations

### Migration Strategy

1. **Version Control**: All migrations tracked in `/lib/db/migrations/`
2. **Naming Convention**: `YYYYMMDD_HHMM_description.sql`
3. **Rollback**: Each migration includes both `up` and `down` scripts

### Running Migrations

```bash
# Push schema changes to database
npm run db-push

# Generate migration file
npx drizzle-kit generate --config ./lib/db/config.ts

# Apply migrations
npx drizzle-kit migrate --config ./lib/db/config.ts
```

---

## Data Seeding

### Seed Script Structure

```typescript
// scripts/seed.ts
import { db } from '@/lib/db/connection';
import { managedLists, countries, organisations } from '@/lib/db/schema';

async function seed() {
  // 1. Managed Lists (reference data)
  await seedManagedLists();
  
  // 2. Countries
  await seedCountries();
  
  // 3. Sample Organisations
  await seedOrganisations();
  
  // 4. Data Labels
  await seedDataLabels();
  
  // 5. KPI Definitions
  await seedKPIs();
}
```

**Run Seeding**:
```bash
npx tsx scripts/seed.ts
```

---

## Database Maintenance

### Regular Tasks

1. **Vacuum**: Monthly (automatically by Supabase)
2. **Analyze**: Weekly for query optimization
3. **Index Rebuild**: Quarterly if needed
4. **Backup Verification**: Weekly

### Performance Monitoring

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Security

### Row Level Security (Future Enhancement)

```sql
-- Example RLS policy for organisations
CREATE POLICY org_isolation ON organisations
  FOR ALL
  USING (
    id = (SELECT organisation_id FROM users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('SA', 'BMO')
    )
  );
```

### Data Retention

- **Audit Logs**: 7 years
- **Data Entries**: Indefinite (historical data)
- **Notifications**: 90 days
- **Excel Imports**: 1 year

---

*Last Updated: November 12, 2025*
