# Pathment - Mentorship Platform UI/UX Design

A comprehensive, high-fidelity UI/UX design for a mentorship platform with role-based access control for Admins, Mentors, and Mentees.

## 🚀 Features

### User Authentication & Registration
- **Registration Page**: Email, password, and role selection (Admin/Mentor/Mentee)
- **Email Verification**: 6-digit code verification with auto-focus and resend functionality
- **Login**: Secure authentication with role-specific dashboard redirects
- **Password Reset**: Multi-step flow with email input, token validation, and new password creation

### Admin Portal
- **Dashboard Overview**: Statistics for programs, users, and system metrics
- **Program Management**:
  - Create programs with name, description, type, duration, levels, and skill tags
  - List view with search, sorting, and filters
  - Detailed program view with curriculum, mentors, and roadmap
- **AI Roadmap Generator**: 
  - Automatic learning path generation
  - Weekly tasks with objectives and resources
  - Drag-and-drop editing capabilities
- **Mentor Assignment**: AI-powered matching suggestions based on skills and availability
- **Enrollment Overview**: Track mentee-mentor pairings and progress

### Mentee Portal
- **Dashboard**: Current program progress, upcoming tasks, and recent feedback
- **Program Enrollment**: Browse and enroll in programs with confirmation
- **Task Management**:
  - View all tasks with status filtering (Assigned → In Progress → Submitted → Revision Needed → Completed)
  - Submit tasks with descriptions, links, and file attachments
  - Track progress and deadlines
- **Feedback View**: Detailed mentor feedback with ratings and improvement suggestions

### Mentor Portal
- **Dashboard**: Overview of mentees, pending reviews, and performance stats
- **Task Assignment**:
  - Assign from roadmap or create custom tasks
  - Set deadlines and priorities
  - Add learning resources
- **Review Queue**: Prioritized list of submissions with urgency indicators
- **Feedback Provision**:
  - Rate submissions (1-5 stars)
  - Provide detailed markdown feedback
  - Approve or request revisions

## 🎨 Design Features

### Modern UI Elements
- Clean, professional SaaS-style design
- Responsive layout for desktop and mobile
- Gradient accents and smooth transitions
- Color-coded status indicators
- Intuitive navigation with sidebar and mobile menu

### Component Library
- Reusable components across all roles
- Consistent design language
- Accessible form inputs and buttons
- Modal dialogs and confirmation screens
- Toast notifications and alerts

### Status Indicators
- **Active**: Green indicators for active programs/enrollments
- **Pending**: Yellow for items awaiting action
- **Completed**: Blue for finished tasks
- **Revision Needed**: Orange for items requiring changes
- **High Priority**: Red badges for urgent items

## 📱 Navigation

### Demo Credentials
Use these credentials to explore different roles:

- **Admin**: admin@pathment.com (password: any text)
- **Mentor**: mentor@pathment.com (password: any text)
- **Mentee**: mentee@pathment.com (password: any text)

### Main Routes

#### Authentication
- `/register` - User registration
- `/login` - User login
- `/verify-email` - Email verification
- `/reset-password` - Password reset flow

#### Admin Routes
- `/admin/dashboard` - Admin overview
- `/admin/programs` - Program listing
- `/admin/programs/create` - Create new program
- `/admin/programs/:id` - Program details
- `/admin/programs/:id/roadmap` - AI roadmap generator
- `/admin/mentors/assign` - Mentor assignment with AI matching
- `/admin/enrollments` - Enrollment overview

#### Mentee Routes
- `/mentee/dashboard` - Mentee home
- `/mentee/programs/:id/enroll` - Program enrollment
- `/mentee/tasks` - Task list
- `/mentee/tasks/:id/submit` - Task submission
- `/mentee/feedback/:id` - View feedback

#### Mentor Routes
- `/mentor/dashboard` - Mentor home
- `/mentor/tasks/assign` - Assign tasks
- `/mentor/tasks/review` - Review queue
- `/mentor/tasks/:id/feedback` - Provide feedback

## 🎯 Key User Flows

### 1. Admin Creating a Program
1. Navigate to Programs → Create Program
2. Fill in program details (name, description, type, level)
3. Add skill tags and set dates
4. Save and generate AI roadmap
5. Edit roadmap with weekly tasks and objectives
6. Assign mentors to program

### 2. Mentee Completing a Task
1. View assigned tasks on dashboard
2. Click on task to view details
3. Submit work with description and links
4. Receive notification when feedback is ready
5. View detailed feedback with rating

### 3. Mentor Reviewing Submissions
1. Check review queue for pending submissions
2. Review mentee's work and attachments
3. Provide detailed feedback with markdown
4. Rate submission (1-5 stars)
5. Approve or request revisions

## 🔔 Notifications & System Messages

### Notification Types
- **Match Confirmation**: Mentee-mentor pairing success
- **Task Assignment**: New tasks from mentor
- **Feedback Received**: Mentor completed review
- **Deadline Reminder**: Upcoming task due dates
- **Success Messages**: Confirmations for completed actions
- **Warning Messages**: Urgent items requiring attention

### Email Notifications
- Account verification
- Password reset
- Mentor match confirmation
- Task assignment
- Feedback submission
- Deadline reminders

## 🎨 Design System

### Colors
- **Primary**: Indigo (600-700)
- **Success**: Green (600-700)
- **Warning**: Yellow/Orange (600-700)
- **Error**: Red (600-700)
- **Info**: Blue (600-700)
- **Neutral**: Slate (50-900)

### Typography
- Clean, modern sans-serif font
- Hierarchical heading structure
- Readable body text with proper spacing
- Consistent sizing across components

### Spacing
- Consistent padding and margins
- Generous whitespace
- Card-based layouts
- Grid system for responsive design

## 🔧 Technical Details

### Built With
- React with TypeScript
- React Router for navigation
- Tailwind CSS for styling
- Lucide React for icons

### Component Structure
```
/components
  /auth - Authentication screens
  /admin - Admin portal components
  /mentee - Mentee portal components
  /mentor - Mentor portal components
  /shared - Shared components (Navigation, Notifications)
```

### Responsive Design
- Mobile-first approach
- Breakpoints at 640px (sm), 768px (md), 1024px (lg)
- Sidebar navigation on desktop
- Mobile menu with hamburger icon
- Responsive tables and cards

## 📝 Notes

### AI Features Highlighted
- AI-powered roadmap generation
- AI mentor matching suggestions
- Smart notifications and reminders

### Sample Data
All data is mock/sample data for demonstration purposes. In production:
- Connect to backend API
- Implement real authentication
- Add database integration
- Enable file uploads
- Integrate email service

### Accessibility
- Semantic HTML structure
- ARIA labels where needed
- Keyboard navigation support
- Focus management in modals
- Color contrast compliance

## 🎯 Next Steps for Production

1. **Backend Integration**
   - Connect to API endpoints
   - Implement real authentication (JWT, OAuth)
   - Add authorization middleware

2. **Database**
   - Setup PostgreSQL/MongoDB
   - Create data models
   - Implement relationships

3. **File Storage**
   - Integrate S3/Cloud Storage
   - Handle file uploads
   - Implement download functionality

4. **Email Service**
   - Setup SendGrid/AWS SES
   - Create email templates
   - Implement notification system

5. **Testing**
   - Unit tests for components
   - Integration tests for flows
   - E2E tests for critical paths

6. **Performance**
   - Code splitting
   - Lazy loading
   - Image optimization
   - Caching strategies

---

**Pathment** - Empowering growth through mentorship 🚀
