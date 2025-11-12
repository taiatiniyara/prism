# PRISM - Performance Reporting & Information System Management

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

A comprehensive benchmarking and performance monitoring platform for utility organizations across regions. PRISM enables utilities to enter operational data, track KPIs, and generate insights through integrated Power BI dashboards.

---

## 🌟 Features

- **🔐 Magic Link Authentication** - Passwordless login via Supabase Auth
- **📊 Power BI Integration** - Embedded dashboards for real-time insights
- **📝 Flexible Data Entry** - Dynamic forms and Excel bulk uploads
- **✅ Approval Workflow** - Multi-level data validation and approval
- **👥 Role-Based Access Control** - 10 distinct roles with granular permissions
## 🏢 Multi-Tenant Architecture** - Support for multiple utilities with data isolation
- **💻 Server Actions** - Type-safe server-side mutations with automatic caching
- **📈 KPI Calculation Engine** - Automated performance metric calculations
- **🔍 Comprehensive Audit Logs** - Track all system activities
- **⚡ Modern Tech Stack** - Built with Next.js 16, TypeScript, and Tailwind CSS

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL database (via Supabase)

### Installation

```bash
# Clone the repository
git clone https://github.com/taiatiniyara/prism.git
cd prism

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Push database schema
npm run db-push

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

---

## 📚 Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and technical architecture
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - Complete database documentation
- **[API Documentation](docs/API_DOCUMENTATION.md)** - REST API endpoints and usage
- **[Development Roadmap](docs/ROADMAP.md)** - Project timeline and milestones
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project

---

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20+
- **API**: Next.js API Routes
- **Authentication**: Better Auth
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Supabase)

### External Services
- **Power BI**: Embedded dashboards
- **Supabase**: Database, Authentication, Email delivery

---

## 🎯 User Roles

| Role | Abbreviation | Description |
|------|--------------|-------------|
| Super Admin | SA | System-wide administrator |
| Benchmarking Officer | BMO | Global admin for all utilities |
| Benchmarking Liaison Officer | BLO | Utility administrator |
| Data Acquisition Officer | DAO | Data entry by category |
| Chief Executive Officer | CEO | Approves data entries |
| Consultant | CON | External consultants |
| Affiliate | AFF | View-only dashboard access |
| Ally | ALL | View-only dashboard access |
| Manager | MGR | Read-only utility access |
| Executive | EXE | Read-only utility access |

---

## 📁 Project Structure

```
prism/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── (dashboard)/       # Protected routes
│   └── actions/           # Server Actions
├── components/            # React components
│   ├── ui/               # UI primitives
│   └── features/         # Feature components
├── lib/                   # Shared utilities
│   ├── db/               # Database layer
│   ├── auth/             # Auth configuration
│   └── rbac/             # Access control
├── docs/                  # Documentation
└── public/                # Static assets
```

---

## 🔒 Security

- **Authentication**: Supabase Auth with magic links
- **Authorization**: Role-based access control (RBAC)
- **Data Protection**: Row-level security and encryption
- **Audit Trail**: Comprehensive activity logging
- **Input Validation**: Type-safe validation with Zod

---

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Generate coverage report
npm test -- --coverage
```

---

## 📈 Development Workflow

1. **Create a branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** following our [coding standards](CONTRIBUTING.md#coding-standards)

3. **Commit** using conventional commits
   ```bash
   git commit -m "feat(scope): description"
   ```

4. **Push** and create a Pull Request
   ```bash
   git push origin feature/your-feature-name
   ```

---

## 🗺️ Roadmap

### Phase 1: Foundation (Weeks 1-3) ✅
- [x] Database schema design
- [x] Authentication setup
- [x] RBAC implementation

### Phase 2: Core Features (Weeks 4-8) 🚧
- [ ] User management
- [ ] Organization structure
- [ ] KPI & Data Label management

### Phase 3: Data Entry (Weeks 9-12) 📋
- [ ] Manual data entry forms
- [ ] Excel upload feature
- [ ] Approval workflow

### Phase 4: Dashboard (Weeks 13-16) 📊
- [ ] Power BI integration
- [ ] Internal analytics
- [ ] Report generation

See the [full roadmap](docs/ROADMAP.md) for details.

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) to learn about:

- Development setup
- Coding standards
- Git workflow
- Pull request process

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

- **Project Lead**: [Your Name]
- **Backend**: [Developer Names]
- **Frontend**: [Developer Names]
- **Database**: [Developer Names]

---

## 📧 Contact

For questions or support:

- **Email**: support@prism.example.com
- **GitHub Issues**: [Create an issue](https://github.com/taiatiniyara/prism/issues)
- **Documentation**: [View docs](docs/)

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Supabase](https://supabase.com/) - Backend platform & Authentication
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [Shadcn/ui](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

## 📊 Status

![GitHub commit activity](https://img.shields.io/github/commit-activity/m/taiatiniyara/prism)
![GitHub last commit](https://img.shields.io/github/last-commit/taiatiniyara/prism)
![GitHub issues](https://img.shields.io/github/issues/taiatiniyara/prism)
![GitHub pull requests](https://img.shields.io/github/issues-pr/taiatiniyara/prism)

---

*Built with ❤️ for utility benchmarking excellence*
