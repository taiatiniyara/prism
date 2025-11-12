# PRISM API Documentation

## Base URL

```
Development: http://localhost:3000/api
Production: https://prism.yourdomain.com/api
```

---

## Authentication

All API requests (except auth endpoints) require authentication via session cookie or Bearer token.

### Headers

```http
Authorization: Bearer <session_token>
Content-Type: application/json
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-11-12T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You don't have permission to access this resource",
    "details": {
      "requiredRole": "BLO",
      "currentRole": "DAO"
    }
  },
  "meta": {
    "timestamp": "2025-11-12T10:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Authentication Endpoints

### Send Magic Link

**POST** `/api/auth/magic-link`

Send a magic link to user's email for authentication.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Magic link sent to user@example.com"
  }
}
```

---

### Verify Magic Link

**GET** `/api/auth/verify?token=<token>`

Verify magic link token and create session.

**Response**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "BLO",
      "organisation": {
        "id": "org_456",
        "name": "Utility Company"
      }
    },
    "session": {
      "token": "sess_789",
      "expiresAt": "2025-11-13T10:00:00Z"
    }
  }
}
```

---

### Logout

**POST** `/api/auth/logout`

Invalidate current session.

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

### Get Current User

**GET** `/api/auth/me`

Get authenticated user details.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "BLO",
    "organisation": {
      "id": "org_456",
      "name": "Utility Company",
      "country": "Kenya"
    },
    "permissions": ["data_entry", "approve", "manage_users"]
  }
}
```

---

## Organisation Endpoints

### List Organisations

**GET** `/api/organisations`

**Query Parameters**:
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `country_id` (uuid): Filter by country
- `is_utility` (boolean): Filter by utility status

**Required Role**: SA, BMO

**Response**:
```json
{
  "success": true,
  "data": {
    "organisations": [
      {
        "id": "org_123",
        "name": "Kenya Power",
        "acronym": "KPLC",
        "country": {
          "id": "country_456",
          "name": "Kenya",
          "iso_alpha_2": "KE"
        },
        "is_utility": true,
        "is_active": true,
        "created_at": "2025-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

---

### Get Organisation

**GET** `/api/organisations/:id`

**Required Role**: SA, BMO, or member of organisation

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "org_123",
    "name": "Kenya Power",
    "acronym": "KPLC",
    "country": {
      "id": "country_456",
      "name": "Kenya",
      "iso_alpha_2": "KE"
    },
    "is_utility": true,
    "is_active": true,
    "consultants": [
      {
        "id": "cons_789",
        "name": "Jane Smith",
        "email": "jane@consulting.com",
        "assigned_date": "2025-01-15"
      }
    ],
    "stats": {
      "users": 12,
      "service_areas": 5,
      "generators": 8
    },
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

---

### Create Organisation

**POST** `/api/organisations`

**Required Role**: SA, BMO

**Request Body**:
```json
{
  "name": "Uganda Electricity",
  "acronym": "UE",
  "country_id": "country_789",
  "is_utility": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "org_new123",
    "name": "Uganda Electricity",
    "acronym": "UE",
    "country_id": "country_789",
    "is_utility": true,
    "is_active": true,
    "created_at": "2025-11-12T10:00:00Z"
  }
}
```

---

### Update Organisation

**PUT** `/api/organisations/:id`

**Required Role**: SA, BMO, BLO (own org only)

**Request Body**:
```json
{
  "name": "Kenya Power & Lighting",
  "is_active": true
}
```

---

### Delete Organisation

**DELETE** `/api/organisations/:id`

**Required Role**: SA, BMO

**Note**: Soft delete (sets `is_active` to false)

---

## User Management Endpoints

### List Users

**GET** `/api/users`

**Query Parameters**:
- `organisation_id` (uuid): Filter by organisation
- `role` (string): Filter by role
- `page`, `limit`: Pagination

**Required Role**: SA, BMO, BLO (own org only)

**Response**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user_123",
        "email": "john@kplc.co.ke",
        "name": "John Doe",
        "role": "DAO",
        "organisation": {
          "id": "org_456",
          "name": "Kenya Power"
        },
        "is_active": true,
        "last_login": "2025-11-11T15:30:00Z"
      }
    ],
    "pagination": { ... }
  }
}
```

---

### Create User

**POST** `/api/users`

**Required Role**: SA, BMO, BLO (own org only)

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "DAO",
  "organisation_id": "org_456",
  "data_label_categories": ["FIN", "OPS"]
}
```

---

### Update User

**PUT** `/api/users/:id`

**Request Body**:
```json
{
  "name": "Updated Name",
  "role": "BLO",
  "is_active": true
}
```

---

### Deactivate User

**DELETE** `/api/users/:id`

**Note**: Soft delete (sets `is_active` to false)

---

## Data Entry Endpoints

### List Data Entries

**GET** `/api/data-entries`

**Query Parameters**:
- `organisation_id` (uuid): Required for non-SA/BMO roles
- `year` (number): Filter by year
- `month` (number): Filter by month
- `status` (string): Filter by status
- `data_label_id` (uuid): Filter by data label
- `page`, `limit`: Pagination

**Response**:
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "entry_123",
        "organisation": {
          "id": "org_456",
          "name": "Kenya Power"
        },
        "data_label": {
          "id": "dl_789",
          "name": "Total Revenue",
          "category": "Financial"
        },
        "period": {
          "year": 2025,
          "month": 10
        },
        "value": 15000000,
        "status": "approved",
        "submitted_by": {
          "id": "user_123",
          "name": "John Doe"
        },
        "submitted_at": "2025-11-01T10:00:00Z",
        "approved_by": {
          "id": "user_456",
          "name": "CEO Name"
        },
        "approved_at": "2025-11-05T14:30:00Z"
      }
    ],
    "pagination": { ... }
  }
}
```

---

### Get Data Entry

**GET** `/api/data-entries/:id`

---

### Create Data Entry

**POST** `/api/data-entries`

**Required Role**: BLO, DAO (for assigned categories only), CON

**Request Body**:
```json
{
  "organisation_id": "org_456",
  "data_label_id": "dl_789",
  "period_year": 2025,
  "period_month": 10,
  "value": 15000000,
  "service_area_id": "sa_123",  // Optional
  "generator_id": "gen_456",    // Optional
  "notes": "October revenue figures",
  "status": "draft"  // or "submitted"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "entry_new123",
    "organisation_id": "org_456",
    "data_label_id": "dl_789",
    "period_year": 2025,
    "period_month": 10,
    "value": 15000000,
    "status": "draft",
    "created_at": "2025-11-12T10:00:00Z"
  }
}
```

---

### Update Data Entry

**PUT** `/api/data-entries/:id`

**Note**: Can only update entries in "draft" status

**Request Body**:
```json
{
  "value": 16000000,
  "notes": "Revised figures"
}
```

---

### Submit Data Entry

**POST** `/api/data-entries/:id/submit`

**Description**: Change status from "draft" to "submitted" and notify CEO

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "entry_123",
    "status": "submitted",
    "submitted_at": "2025-11-12T10:00:00Z"
  }
}
```

---

### Approve Data Entry

**POST** `/api/data-entries/:id/approve`

**Required Role**: CEO

**Request Body**:
```json
{
  "notes": "Approved for Q4 reporting"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "entry_123",
    "status": "approved",
    "approved_by": "user_ceo",
    "approved_at": "2025-11-12T10:00:00Z"
  }
}
```

---

### Reject Data Entry

**POST** `/api/data-entries/:id/reject`

**Required Role**: CEO

**Request Body**:
```json
{
  "rejection_reason": "Values seem incorrect, please verify source data"
}
```

---

### Bulk Data Entry

**POST** `/api/data-entries/bulk`

**Request Body**:
```json
{
  "organisation_id": "org_456",
  "period_year": 2025,
  "period_month": 10,
  "entries": [
    {
      "data_label_id": "dl_001",
      "value": 1000000
    },
    {
      "data_label_id": "dl_002",
      "value": 50000
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": 0,
    "entries": [ ... ]
  }
}
```

---

## Excel Import Endpoints

### Upload Excel File

**POST** `/api/excel/upload`

**Content-Type**: `multipart/form-data`

**Form Data**:
- `file`: Excel file
- `organisation_id`: Organisation UUID
- `period_year`: Year
- `period_month`: Month

**Response**:
```json
{
  "success": true,
  "data": {
    "import_id": "import_123",
    "status": "processing",
    "file_name": "october_data.xlsx"
  }
}
```

---

### Get Import Status

**GET** `/api/excel/imports/:id`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "import_123",
    "status": "completed",
    "total_rows": 100,
    "successful_rows": 95,
    "failed_rows": 5,
    "error_report": {
      "errors": [
        {
          "row": 5,
          "column": "Total Revenue",
          "error": "Value must be numeric"
        }
      ]
    },
    "created_at": "2025-11-12T09:00:00Z",
    "completed_at": "2025-11-12T09:05:00Z"
  }
}
```

---

### Download Template

**GET** `/api/excel/template`

**Query Parameters**:
- `category_id` (uuid): Data label category
- `organisation_id` (uuid): For organization-specific labels

**Response**: Excel file download

---

## KPI Endpoints

### List KPIs

**GET** `/api/kpis`

**Query Parameters**:
- `category_id` (uuid): Filter by category
- `subcategory_id` (uuid): Filter by subcategory

**Response**:
```json
{
  "success": true,
  "data": {
    "kpis": [
      {
        "id": "kpi_123",
        "name": "Revenue per Customer",
        "description": "Average revenue generated per customer",
        "category": "Financial Health",
        "subcategory": "Revenue",
        "formula": "revenue / customers",
        "unit": "USD",
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
    ]
  }
}
```

---

### Get KPI Calculations

**GET** `/api/kpis/:id/calculations`

**Query Parameters**:
- `organisation_id` (uuid): Required
- `year` (number): Required
- `month` (number): Optional (returns all months if omitted)

**Response**:
```json
{
  "success": true,
  "data": {
    "kpi": {
      "id": "kpi_123",
      "name": "Revenue per Customer"
    },
    "calculations": [
      {
        "period": {
          "year": 2025,
          "month": 10
        },
        "value": 20.50,
        "metadata": {
          "inputs": {
            "revenue": 1000000,
            "customers": 48780
          },
          "calculated_at": "2025-11-05T15:00:00Z"
        }
      }
    ]
  }
}
```

---

### Create KPI Definition

**POST** `/api/kpis`

**Required Role**: SA, BMO

**Request Body**:
```json
{
  "name": "System Efficiency",
  "description": "Percentage of energy delivered vs generated",
  "category_id": "cat_123",
  "subcategory_id": "subcat_456",
  "formula": "((generated - losses) / generated) * 100",
  "inputs": [
    {
      "data_label_id": "dl_energy_generated",
      "variable": "generated"
    },
    {
      "data_label_id": "dl_system_losses",
      "variable": "losses"
    }
  ],
  "unit": "%",
  "display_format": "percentage"
}
```

---

## Data Label Endpoints

### List Data Labels

**GET** `/api/data-labels`

**Query Parameters**:
- `category_id` (uuid): Filter by category
- `subcategory_id` (uuid): Filter by subcategory

**Response**:
```json
{
  "success": true,
  "data": {
    "data_labels": [
      {
        "id": "dl_123",
        "name": "Total Revenue",
        "description": "Total revenue for the period",
        "category": "Financial",
        "subcategory": "Income",
        "data_type": "currency",
        "unit": "USD",
        "validation_rules": {
          "min": 0,
          "decimal_places": 2
        },
        "is_required": true
      }
    ]
  }
}
```

---

### Create Data Label

**POST** `/api/data-labels`

**Required Role**: SA, BMO

---

## Dashboard Endpoints

### Get Dashboard Data

**GET** `/api/dashboard`

**Query Parameters**:
- `organisation_id` (uuid): Required (auto-filled for non-SA/BMO)

**Response**:
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
