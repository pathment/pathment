# Component Organization

## Structure

Components are now organized by **role** and **feature**:

```
components/
├── admin/
│   ├── dashboard/           # Admin dashboard components
│   │   ├── DashboardStats.tsx
│   │   ├── QuickActions.tsx
│   │   ├── RecentActivity.tsx
│   │   └── index.ts
│   ├── programs/            # Program management components
│   │   ├── ProgramListCard.tsx
│   │   └── index.ts
│   ├── enrollment/          # Enrollment management components
│   ├── matching/            # Mentor matching components
│   └── roadmap/             # Roadmap generation components
│
├── mentor/
│   ├── dashboard/           # Mentor dashboard components
│   │   ├── MentorStats.tsx
│   │   ├── RecentSubmissions.tsx
│   │   └── index.ts
│   ├── tasks/               # Task management components
│   └── feedback/            # Feedback components
│
├── mentee/
│   ├── dashboard/           # Mentee dashboard components
│   │   ├── MenteeStats.tsx
│   │   ├── UpcomingTasks.tsx
│   │   └── index.ts
│   ├── tasks/               # Task submission components
│   ├── programs/            # Program enrollment components
│   └── feedback/            # Feedback viewing components
│
├── shared/                  # Shared across all roles
│   ├── Navigation.tsx
│   └── RoleGuard.tsx
│
└── ui/                      # UI component library (47 components)
    ├── button.tsx
    ├── card.tsx
    ├── input.tsx
    └── ...
```

## Usage

Import components using index files:

```typescript
// Admin components
import { DashboardStats, QuickActions, RecentActivity } from '@/components/admin/dashboard';
import { ProgramListCard } from '@/components/admin/programs';

// Mentor components
import { MentorStats, RecentSubmissions } from '@/components/mentor/dashboard';

// Mentee components
import { MenteeStats, UpcomingTasks } from '@/components/mentee/dashboard';

// Shared components
import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';

// UI components
import { Button, Card, Input } from '@/components/ui';
```

## Benefits

1. **Role-based organization**: Easy to find components for specific roles
2. **Feature-based grouping**: Components grouped by functionality
3. **Reusability**: Components can be reused across pages
4. **Maintainability**: Clear structure makes updates easier
5. **Type safety**: All components are fully typed with TypeScript
