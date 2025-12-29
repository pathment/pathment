# Pathment Client Interface

AI-Powered Mentorship Platform - Frontend Application

## 🏗️ Project Structure

This project follows a **role-first → feature-second** architecture optimized for multi-tenant mentorship management.

```
client-interface/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication routes (public)
│   │   ├── login/
│   │   ├── register/
│   │   ├── verify-email/
│   │   └── reset-password/
│   ├── (admin)/                  # Admin role routes (protected)
│   │   ├── dashboard/
│   │   ├── programs/             # Program management
│   │   │   ├── create/
│   │   │   └── list/
│   │   ├── roadmap/              # AI roadmap generation
│   │   ├── enrollment/           # Enrollment management
│   │   └── matching/             # Mentor-mentee matching
│   ├── (mentor)/                 # Mentor role routes (protected)
│   │   ├── dashboard/
│   │   ├── mentees/
│   │   ├── tasks/                # Task assignment & review
│   │   └── review-queue/
│   ├── (mentee)/                 # Mentee role routes (protected)
│   │   ├── dashboard/
│   │   ├── programs/             # Program enrollment
│   │   ├── tasks/                # Task submission
│   │   └── feedback/
│   └── layout.tsx                # Root layout with providers
│
├── components/
│   ├── admin/                    # Admin-specific components
│   ├── mentor/                   # Mentor-specific components
│   ├── mentee/                   # Mentee-specific components
│   ├── shared/                   # Cross-role shared components
│   │   ├── Navigation.tsx
│   │   ├── RoleGuard.tsx
│   │   └── ...
│   └── ui/                       # Shadcn UI components (design system)
│
├── lib/
│   ├── api/                      # API endpoint handlers
│   ├── context/                  # React Context providers
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/                    # Custom React hooks
│   │   ├── admin/
│   │   ├── mentor/
│   │   ├── mentee/
│   │   └── shared/
│   ├── services/                 # API service layer
│   │   └── api-client.ts
│   ├── types/                    # TypeScript type definitions
│   │   ├── auth.ts
│   │   ├── program.ts
│   │   ├── roadmap.ts
│   │   ├── task.ts
│   │   ├── enrollment.ts
│   │   └── common.ts
│   ├── utils/                    # Utility functions
│   │   ├── cn.ts
│   │   ├── date.ts
│   │   ├── formatting.ts
│   │   └── validation.ts
│   └── config/                   # Configuration files
│       ├── site.ts
│       ├── api.ts
│       └── theme.ts
│
└── styles/
    ├── globals.css
    └── themes/
        └── default.css           # Multi-tenant theme system
```

## 🎨 Theme System

### Multi-Tenant Dynamic Theming

The application supports **organization-specific theming** with CSS custom properties:

- **Light/Dark Mode**: Full support with seamless switching
- **Organization Colors**: Customizable primary, secondary colors per tenant
- **CSS Variables**: All colors defined as CSS variables for easy theming
- **Runtime Updates**: Theme changes apply instantly without page reload

**Usage:**
```tsx
import { useTheme } from '@/lib/context/ThemeContext';

const { theme, setTheme, setOrganizationTheme } = useTheme();

// Change theme
setTheme('dark');

// Set organization-specific colors
setOrganizationTheme({
  colors: {
    primary: '221.2 83.2% 53.3%',
    secondary: '210 40% 96.1%',
  }
});
```

## 🔐 Authentication & Authorization

### Role-Based Access Control (RBAC)

Three user roles with distinct permissions:

1. **Admin** - Program management, roadmap generation, mentor matching
2. **Mentor** - Task assignment, review submissions, mentee management  
3. **Mentee** - Program enrollment, task submission, feedback viewing

### Protected Routes

All role-specific routes are protected using the `RoleGuard` component:

```tsx
<RoleGuard allowedRoles={['admin']}>
  <AdminDashboard />
</RoleGuard>
```

## 📦 Features Implementation Status

### ✅ Completed

- [x] **Folder structure** (role-first → feature-second)
- [x] **Multi-tenant theming system**
- [x] **TypeScript types** for all entities
- [x] **UI component library** (Shadcn UI - 47 components)
- [x] **Shared components** (Navigation, RoleGuard)
- [x] **Authentication pages** (Login)
- [x] **Role-based layouts** for all 3 roles
- [x] **Context providers** (Auth, Theme)
- [x] **API service layer** (ready for backend integration)
- [x] **Utility functions** (validation, formatting, dates)
- [x] **Configuration files** (site, API, theme)
- [x] **Dashboard pages** for all roles

### 🚧 Ready to Implement (All UI Components Available)

All feature pages below can be quickly implemented using components from High-Fidelity Design:

**Admin Features:**
- Program creation form (UC 3.5)
- AI roadmap generator (UC 3.6)
- Enrollment overview
- Mentor-mentee matching with AI (UC 3.8)

**Mentor Features:**
- Task assignment form (UC 3.9)
- Review queue interface (UC 3.11)
- Feedback provision with markdown

**Mentee Features:**
- Program enrollment flow (UC 3.7)
- Task list & submission (UC 3.10)
- Feedback view

**Auth Features:**
- Register page (UC 3.1)
- Email verification (UC 3.2)
- Password reset (UC 3.4)

## 🚀 Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run development server
npm run dev
```

## 🔌 API Integration

API service layer is ready. Just update the endpoint in `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

All API calls are typed and use Axios interceptors for auth tokens.

## 📝 Use Cases Status

| UC | Feature | Location | Status |
|----|---------|----------|--------|
| 3.1 | User Registration | `app/(auth)/register/` | 🚧 UI Ready |
| 3.2 | Email Verification | `app/(auth)/verify-email/` | 🚧 UI Ready |
| 3.3 | User Login | `app/(auth)/login/` | ✅ Complete |
| 3.4 | Password Reset | `app/(auth)/reset-password/` | 🚧 UI Ready |
| 3.5 | Create Program | `app/(admin)/programs/create/` | 🚧 UI Ready |
| 3.6 | AI Roadmap | `app/(admin)/roadmap/generate/` | 🚧 UI Ready |
| 3.7 | Program Enrollment | `app/(mentee)/programs/enroll/` | 🚧 UI Ready |
| 3.8 | AI Matching | `app/(admin)/matching/` | 🚧 UI Ready |
| 3.9 | Assign Task | `app/(mentor)/tasks/assign/` | 🚧 UI Ready |
| 3.10 | Submit Task | `app/(mentee)/tasks/submit/` | 🚧 UI Ready |
| 3.11 | Review Task | `app/(mentor)/review-queue/` | 🚧 UI Ready |

## 🛠️ Tech Stack

- Next.js 16 | TypeScript | Tailwind CSS 4
- Shadcn UI (Radix UI) | React Hook Form | Zod
- Axios | date-fns | Lucide Icons

---

**All UI components from High-Fidelity design are ported. Ready for feature implementation! 🚀**
