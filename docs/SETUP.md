# PRISM - Setup Guide

This guide will help you set up the PRISM development environment from scratch.

---

## Prerequisites

Before you begin, ensure you have the following installed:

### Required Software

1. **Node.js** (v20 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **npm** (v10 or higher)
   - Comes with Node.js
   - Verify installation: `npm --version`

3. **Git**
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify installation: `git --version`

### Required Accounts

1. **Supabase Account** (Free tier available)
   - Sign up at [supabase.com](https://supabase.com/)
   - Create a new project for PRISM

2. **GitHub Account**
   - Sign up at [github.com](https://github.com/)
   - For repository access and collaboration

3. **Power BI Account** (Optional for development)
   - Required only if testing dashboard features
   - Sign up at [powerbi.microsoft.com](https://powerbi.microsoft.com/)

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
# Clone via HTTPS
git clone https://github.com/taiatiniyara/prism.git

# Or clone via SSH (if you have SSH keys set up)
git clone git@github.com:taiatiniyara/prism.git

# Navigate to project directory
cd prism
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages listed in `package.json`.

### 3. Set Up Supabase Database

#### A. Create Supabase Project

1. Go to [supabase.com](https://supabase.com/)
2. Click "New Project"
3. Fill in project details:
   - **Name**: PRISM Development
   - **Database Password**: Choose a strong password
   - **Region**: Select closest to you
4. Wait for project to be created (~2 minutes)

#### B. Get Database Connection String

1. In your Supabase project, go to **Settings** → **Database**
2. Find **Connection string** section
3. Select **URI** tab
4. Copy the connection string (it looks like this):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your actual database password

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Copy the example file
cp .env.example .env.local

# Or create manually
touch .env.local
```

Add the following to `.env.local`:

```env
# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Authentication
BETTER_AUTH_SECRET=your_random_secret_key_here_minimum_32_characters
BETTER_AUTH_URL=http://localhost:3000

# Email Configuration (Development - using Mailtrap)
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_username
SMTP_PASS=your_mailtrap_password
SMTP_FROM=noreply@prism.local

# Power BI (Optional - only if testing dashboard)
POWER_BI_CLIENT_ID=
POWER_BI_CLIENT_SECRET=
POWER_BI_TENANT_ID=
```

#### Generate BETTER_AUTH_SECRET

```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 5. Set Up Email Testing (Mailtrap)

For development, we use [Mailtrap](https://mailtrap.io/) to test emails without sending real ones:

1. Go to [mailtrap.io](https://mailtrap.io/) and sign up (free)
2. Create a new inbox called "PRISM Development"
3. Go to **SMTP Settings**
4. Copy the credentials:
   - Host: `sandbox.smtp.mailtrap.io`
   - Port: `2525`
   - Username: Your Mailtrap username
   - Password: Your Mailtrap password
5. Add these to your `.env.local` file

### 6. Initialize Database Schema

Push the database schema to Supabase:

```bash
npm run db-push
```

This will create all necessary tables in your database.

### 7. Seed the Database (Optional)

If seed scripts are available:

```bash
npx tsx scripts/seed.ts
```

This will populate the database with sample data for development.

### 8. Start Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

---

## Verify Installation

### Check Database Connection

1. Visit your Supabase project dashboard
2. Go to **Table Editor**
3. You should see tables like:
   - `organisations`
   - `countries`
   - `data_label_definitions`
   - `kpi_definitions`
   - `users`

### Check Application

1. Open [http://localhost:3000](http://localhost:3000)
2. You should see the PRISM home page
3. Try navigating to different pages

---

## IDE Setup (VS Code Recommended)

### Install VS Code

Download from [code.visualstudio.com](https://code.visualstudio.com/)

### Recommended Extensions

Install these extensions for the best development experience:

1. **ESLint** (`dbaeumer.vscode-eslint`)
   - Linting and code quality

2. **Prettier** (`esbenp.prettier-vscode`)
   - Code formatting

3. **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)
   - Tailwind class autocomplete

4. **TypeScript Nightly** (`ms-vscode.vscode-typescript-next`)
   - Latest TypeScript features

5. **Error Lens** (`usernamehw.errorlens`)
   - Inline error display

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

---

## Common Issues & Solutions

### Issue: Database connection fails

**Solution**:
- Verify your DATABASE_URL in `.env.local`
- Ensure your Supabase project is active
- Check if your IP is whitelisted in Supabase (for external connections)

### Issue: Port 3000 already in use

**Solution**:
```bash
# Find and kill the process using port 3000
# On Windows
netstat -ano | findstr :3000
taskkill /PID [PID] /F

# On Mac/Linux
lsof -ti:3000 | xargs kill -9

# Or use a different port
npm run dev -- -p 3001
```

### Issue: Module not found errors

**Solution**:
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Database schema changes not applied

**Solution**:
```bash
# Force push schema changes
npm run db-push

# Or reset database (WARNING: deletes all data)
npx drizzle-kit drop --config ./lib/db/config.ts
npm run db-push
```

---

## Next Steps

After successful setup:

1. **Read the Documentation**
   - [Architecture Overview](ARCHITECTURE.md)
   - [Database Schema](DATABASE_SCHEMA.md)
   - [API Documentation](API_DOCUMENTATION.md)

2. **Review the Codebase**
   - Explore `app/` directory for routes
   - Check `lib/db/schema/` for database models
   - Look at `components/` for UI components

3. **Start Contributing**
   - Read [Contributing Guide](../CONTRIBUTING.md)
   - Check [GitHub Issues](https://github.com/taiatiniyara/prism/issues)
   - Pick a task from the [Roadmap](ROADMAP.md)

---

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Push database schema
npm run db-push

# Open Drizzle Studio (database GUI)
npx drizzle-kit studio --config ./lib/db/config.ts

# Run tests (when available)
npm test

# Quick save to git
npm run save
```

---

## Getting Help

If you encounter issues:

1. Check this setup guide thoroughly
2. Search [GitHub Issues](https://github.com/taiatiniyara/prism/issues)
3. Ask in the team chat/Discord
4. Create a new issue with the `help wanted` label

---

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Better Auth Docs](https://www.better-auth.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

---

*Last Updated: November 12, 2025*
