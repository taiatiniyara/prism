# PRISM User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Role-Specific Guides](#role-specific-guides)
   - [Super Admin (SA)](#super-admin-sa)
   - [Benchmarking Officer (BMO)](#benchmarking-officer-bmo)
   - [Benchmarking Liaison Officer (BLO)](#benchmarking-liaison-officer-blo)
   - [Data Acquisition Officer (DAO)](#data-acquisition-officer-dao)
   - [Chief Executive Officer (CEO)](#chief-executive-officer-ceo)
   - [Consultant (CON)](#consultant-con)
   - [Affiliate/Ally (AFF/ALL)](#affiliateally-affall)
   - [Manager/Executive (MGR/EXE)](#managerexecutive-mgrexe)
4. [Common Tasks](#common-tasks)
5. [FAQ](#faq)

---

## Introduction

PRISM (Performance Reporting & Information System Management) is a comprehensive platform designed to help utility organizations track performance metrics, enter operational data, and generate insights through integrated dashboards.

### Key Features

- **Magic Link Authentication** - Secure, passwordless login via Supabase Auth
- **Role-Based Access** - Each user sees only what they need
- **Data Entry** - Manual forms and Excel bulk upload
- **Approval Workflow** - Multi-level data validation
- **Dashboard Analytics** - Real-time performance insights
- **KPI Tracking** - Automated calculations and monitoring

---

## Getting Started

### Accessing PRISM

1. Open your web browser and go to: `https://prism.yourdomain.com`
2. Enter your email address
3. Check your email for a magic link
4. Click the link to log in

### First Login

After your first login:

1. **Update your profile** - Add your name and contact information
2. **Set notification preferences** - Choose how you want to be notified
3. **Review your role** - Understand what you can access
4. **Take a tour** - Familiarize yourself with the interface

---

## Role-Specific Guides

### Super Admin (SA)

**Access Level**: Full system access

#### Responsibilities

- System-wide configuration and management
- User management across all organizations
- KPI and data label definitions
- System monitoring and maintenance

#### Key Features

##### 1. System Dashboard
- View overall system health
- Monitor all organization activities
- Track system-wide metrics

##### 2. Organization Management
```
Navigate to: Settings → Organizations

Actions:
- Create new organizations
- Edit organization details
- Activate/deactivate organizations
- Assign consultants
```

##### 3. User Management
```
Navigate to: Settings → Users

Actions:
- Create users for any organization
- Assign roles
- Reset user access
- View user activity logs
```

##### 4. KPI Management
```
Navigate to: Settings → KPIs

Actions:
- Define new KPIs
- Edit KPI formulas
- Set KPI categories
- Assign data labels to KPIs
```

##### 5. Data Label Management
```
Navigate to: Settings → Data Labels

Actions:
- Create new data labels
- Define validation rules
- Set categories and subcategories
- Configure data types
```

#### Best Practices

- Regularly review system logs
- Keep KPI definitions up to date
- Monitor data quality across organizations
- Conduct periodic security audits

---

### Benchmarking Officer (BMO)

**Access Level**: Full access to all utilities

#### Responsibilities

- Oversight of all utility organizations
- Cross-utility benchmarking and analysis
- Support for BLOs and utilities
- System configuration (similar to SA)

#### Key Features

##### 1. Cross-Utility Dashboard
```
Navigate to: Dashboard

View:
- Comparative metrics across utilities
- Performance trends
- Data completion rates
- Approval pending items
```

##### 2. Utility Management
```
Navigate to: Organizations

Actions:
- Monitor all utility activities
- Review data submissions
- Generate comparative reports
- Support BLOs with issues
```

##### 3. Benchmarking Reports
```
Navigate to: Reports → Benchmarking

Generate:
- Cross-utility performance comparisons
- Regional analysis
- Trend reports
- Custom analytics
```

#### Workflow Example

**Monthly Benchmarking Cycle**:
1. Review data completion across utilities
2. Follow up with utilities for missing data
3. Generate benchmark reports
4. Distribute insights to stakeholders
5. Schedule reviews with underperforming utilities

---

### Benchmarking Liaison Officer (BLO)

**Access Level**: Full access to own utility

#### Responsibilities

- Utility administrator role
- Coordinate data entry activities
- Manage utility users (DAOs, CEO)
- Review and submit data entries
- Manage service areas and generators

#### Key Features

##### 1. Utility Dashboard
```
Navigate to: Dashboard

View:
- Utility performance overview
- Pending approvals
- Data completion status
- Team activity
```

##### 2. User Management (Utility)
```
Navigate to: Settings → Users

Actions:
- Invite new users to utility
- Assign DAO categories
- Manage user roles
- Deactivate users
```

##### 3. Data Entry
```
Navigate to: Data Entry

Workflow:
1. Select reporting period
2. Choose data category
3. Fill in all required data labels
4. Save as draft or submit
5. Track submission status
```

##### 4. Service Area Management
```
Navigate to: Settings → Service Areas

Actions:
- Add new service areas
- Update service area details
- Assign population and coverage data
- Link generators to service areas
```

##### 5. Generator Management
```
Navigate to: Settings → Generators

Actions:
- Register new generators
- Update generator capacity
- Track commissioning dates
- Set generator status
```

#### Monthly Checklist

- [ ] Review data entry completion
- [ ] Follow up with DAOs for missing entries
- [ ] Review and submit all data entries
- [ ] Monitor CEO approval status
- [ ] Update generator/service area information
- [ ] Review dashboard for anomalies
- [ ] Coordinate with consultants (if applicable)

---

### Data Acquisition Officer (DAO)

**Access Level**: Data entry for assigned categories only

#### Responsibilities

- Enter operational data for assigned categories
- Ensure data accuracy and completeness
- Meet submission deadlines
- Respond to feedback on submissions

#### Key Features

##### 1. Data Entry Dashboard
```
Navigate to: Dashboard

View:
- Assigned data categories
- Current period status
- Pending submissions
- Recent activity
```

##### 2. Manual Data Entry
```
Navigate to: Data Entry → Manual

Steps:
1. Select reporting period (e.g., October 2025)
2. Choose your data category (e.g., Financial)
3. Fill in values for each data label
4. Add notes if needed
5. Save draft or submit for review
```

**Example - Financial Data Entry**:
```
Period: October 2025
Category: Financial

Data Labels:
- Total Revenue: $1,000,000
- Operating Expenses: $750,000
- Capital Expenditure: $200,000
- Collections: $950,000
- Outstanding Receivables: $500,000

Notes: Included Q4 adjustments
```

##### 3. Excel Upload
```
Navigate to: Data Entry → Upload Excel

Steps:
1. Download template for your category
2. Fill in Excel template
3. Save the file
4. Upload to PRISM
5. Review validation results
6. Submit if no errors
```

##### 4. Track Submissions
```
Navigate to: Data Entry → History

View:
- Submission status (Draft, Submitted, Approved, Rejected)
- CEO feedback
- Revision requests
- Approval timeline
```

#### Tips for Data Entry

✅ **Do's**:
- Enter data promptly after month-end
- Double-check calculations
- Add explanatory notes for unusual values
- Save drafts frequently
- Review data before submitting

❌ **Don'ts**:
- Don't estimate values - use actual data
- Don't skip required fields
- Don't ignore validation errors
- Don't submit without review

#### Handling Rejections

If your data entry is rejected:

1. **Review CEO feedback** - Understand the reason
2. **Check your source data** - Verify accuracy
3. **Make corrections** - Update values as needed
4. **Add clarification notes** - Explain the corrections
5. **Resubmit** - Send for approval again

---

### Chief Executive Officer (CEO)

**Access Level**: View all utility data, approve submissions

#### Responsibilities

- Review and approve data submissions
- Validate data accuracy
- Provide feedback on submissions
- Monitor overall utility performance

#### Key Features

##### 1. Approval Dashboard
```
Navigate to: Dashboard

View:
- Pending approvals
- Recent submissions
- Approval history
- Performance overview
```

##### 2. Review Data Entries
```
Navigate to: Approvals → Pending

For each submission:
- Review submitted values
- Check historical trends
- Compare with previous periods
- Read DAO notes
```

##### 3. Approve Submissions
```
Actions available:
- Approve: Data is accurate and complete
- Reject: Data needs revision

When rejecting:
- Provide clear feedback
- Specify what needs correction
- Set expectations for resubmission
```

**Approval Workflow Example**:

```
1. New submission notification received
2. Navigate to Approvals → Pending
3. Review October Financial Data
   - Total Revenue: $1,000,000 ✓
   - Operating Expenses: $750,000 ✓
   - Collections: $950,000 ✓
   
4. Compare with September:
   - Revenue up 5% - reasonable ✓
   - Expenses consistent ✓
   
5. Decision: APPROVE
6. Add note: "Approved for Q4 reporting"
```

##### 4. Dashboard Analytics
```
Navigate to: Dashboard → Analytics

View:
- Key performance indicators
- Trend analysis
- Power BI embedded reports
- Comparative metrics
```

#### Approval Best Practices

- Review submissions within 3 business days
- Provide specific feedback when rejecting
- Look for data inconsistencies
- Compare with previous periods
- Check for unusual trends
- Verify data completeness

---

### Consultant (CON)

**Access Level**: Assigned utilities only

#### Responsibilities

- Provide expert advice to assigned utilities
- Support data entry and analysis
- Generate reports and recommendations
- Assist with performance improvement

#### Key Features

##### 1. Multi-Utility Dashboard
```
Navigate to: Dashboard

View all assigned utilities:
- Performance metrics
- Data quality indicators
- Areas needing attention
```

##### 2. Data Entry Support
```
Navigate to: Data Entry

For assigned utilities:
- Enter data on behalf of utility
- Review submissions
- Identify data gaps
- Provide recommendations
```

##### 3. Analytics & Reporting
```
Navigate to: Reports

Generate:
- Performance reports
- Trend analysis
- Benchmarking comparisons
- Custom analytics
```

#### Consultant Workflow

**Monthly Engagement**:
1. Review assigned utility performance
2. Identify areas of concern
3. Support data entry if needed
4. Generate insights and recommendations
5. Schedule review meetings with utility management
6. Document findings and action items

---

### Affiliate/Ally (AFF/ALL)

**Access Level**: Dashboard view only

#### Responsibilities

- View performance dashboards
- Access reports and analytics
- Monitor utility performance

#### Key Features

##### Dashboard Access
```
Navigate to: Dashboard

View:
- Key performance indicators
- Power BI reports
- Trend charts
- Performance summaries
```

**No data entry or administrative access**

---

### Manager/Executive (MGR/EXE)

**Access Level**: Read-only utility access

#### Responsibilities

- Monitor utility performance
- Review reports and analytics
- Access historical data

#### Key Features

##### Read-Only Dashboard
```
Navigate to: Dashboard

View:
- Utility KPIs
- Performance trends
- Data submissions
- Analytics reports
```

##### Reports Access
```
Navigate to: Reports

View:
- Historical data
- Trend analysis
- Comparative reports
- Power BI dashboards
```

**No edit or approval permissions**

---

## Common Tasks

### Changing Your Password

PRISM uses Supabase Auth with magic link authentication - no password needed!

To access your account:
1. Enter your email on the login page
2. Check your email for the magic link (sent by Supabase)
3. Click the link to log in securely

### Updating Profile Information

```
Navigate to: Settings → Profile

Update:
- Full name
- Contact information
- Profile picture
- Timezone
- Language preference
```

### Setting Notification Preferences

```
Navigate to: Settings → Notifications

Configure:
- Email notifications (On/Off)
- In-app notifications (On/Off)
- Notification frequency (Immediate/Daily/Weekly)
- Notification types:
  ☐ Data entry reminders
  ☐ Approval requests
  ☐ Submission feedback
  ☐ System updates
```

### Downloading Reports

```
Navigate to: Reports

Steps:
1. Select report type
2. Choose date range
3. Select filters (if applicable)
4. Click "Generate Report"
5. Download as PDF or Excel
```

### Viewing Audit Logs

```
Navigate to: Settings → Audit Logs

Filter by:
- Date range
- User
- Action type
- Entity modified
```

---

## FAQ

### Q: I didn't receive the magic link email

**A**: Check your spam/junk folder. If still not found:
- Verify your email address is correct
- Wait a few minutes and check again
- Contact your BLO or system administrator
- Check if your email domain is allowed in Supabase Auth settings

### Q: Can I access PRISM from mobile?

**A**: Yes, PRISM is responsive and works on mobile browsers. A dedicated mobile app is planned for the future.

### Q: How far back can I view historical data?

**A**: All historical data is available. Use the date filters to select your desired time period.

### Q: What happens if I submit incorrect data?

**A**: If approved, contact your BLO immediately to request a correction. If not yet approved, the CEO can reject it and request resubmission.

### Q: Can I export data to Excel?

**A**: Yes, most reports and data views have an "Export to Excel" option.

### Q: Who do I contact for technical support?

**A**: 
- **Data entry issues**: Contact your BLO
- **System access issues**: Contact your BMO
- **Technical problems**: Email support@prism.example.com

### Q: How often should I enter data?

**A**: Data should be entered monthly, typically within 5 business days after month-end. Check with your BLO for specific deadlines.

### Q: What browsers are supported?

**A**: PRISM works best on:
- Google Chrome (recommended)
- Mozilla Firefox
- Microsoft Edge
- Safari

---

## Getting Help

### Support Channels

1. **In-App Help**: Click the "?" icon in the top-right corner
2. **Email**: support@prism.example.com
3. **Documentation**: [docs.prism.example.com](https://docs.prism.example.com)
4. **Your BLO**: Contact your organization's BLO for guidance

### Reporting Issues

When reporting an issue, include:
- What you were trying to do
- What happened instead
- Screenshot (if applicable)
- Your role and organization
- Date and time of the issue

---

*Last Updated: November 12, 2025*
