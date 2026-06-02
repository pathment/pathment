import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppStoreProvider } from '@/store/AppStore';

import { Cockpit } from '@/pages/mentor/Cockpit';
import { CohortReview } from '@/pages/mentor/CohortReview';
import { MenteeProfile } from '@/pages/mentor/MenteeProfile';
import { Approvals } from '@/pages/mentor/Approvals';
import { AtRisk } from '@/pages/mentor/AtRisk';
import { Settings } from '@/pages/mentor/Settings';
import { Roadmaps } from '@/pages/mentor/Roadmaps';
import { Schedules } from '@/pages/mentor/Schedules';
import { Documents } from '@/pages/mentor/Documents';
import { MentorOnboarding } from '@/pages/mentor/Onboarding';
import { Reports } from '@/pages/mentor/Reports';
import { Leaderboard } from '@/pages/mentor/Leaderboard';
import { Rewards } from '@/pages/mentor/Rewards';
import { MentorSpec } from '@/pages/mentor/MentorSpec';
import { ProgressScores } from '@/pages/mentor/ProgressScores';
import { Promotions } from '@/pages/mentor/Promotions';

import { ThisWeek } from '@/pages/mentee/ThisWeek';
import { TaskDetail } from '@/pages/mentee/TaskDetail';
import { MyProgress } from '@/pages/mentee/MyProgress';
import { Blockers } from '@/pages/mentee/Blockers';
import { Meetings } from '@/pages/mentee/Meetings';
import { DailyLog } from '@/pages/mentee/DailyLog';

import { ProgramHealth } from '@/pages/admin/ProgramHealth';
import { People } from '@/pages/admin/People';
import { OrgInsights } from '@/pages/admin/OrgInsights';
import { ReleaseNotes } from '@/pages/admin/ReleaseNotes';
import { Clans } from '@/pages/admin/Clans';
import { ClanRequests } from '@/pages/admin/ClanRequests';
import { Announcements } from '@/pages/admin/Announcements';

import { Community } from '@/pages/mentee/Community';

export function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Routes>
          {/* full-screen mentor onboarding — no app shell */}
          <Route path="/mentor/onboarding" element={<MentorOnboarding />} />

          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/mentor/cockpit" replace />} />

            {/* Mentor */}
            <Route path="/mentor/cockpit" element={<Cockpit />} />
            <Route path="/mentor/review" element={<CohortReview />} />
            <Route path="/mentor/approvals" element={<Approvals />} />
            <Route path="/mentor/at-risk" element={<AtRisk />} />
            <Route path="/mentor/settings" element={<Settings />} />
            <Route path="/mentor/roadmaps" element={<Roadmaps />} />
            <Route path="/mentor/schedules" element={<Schedules />} />
            <Route path="/mentor/scores" element={<ProgressScores />} />
            <Route path="/mentor/reports" element={<Reports />} />
            <Route path="/mentor/leaderboard" element={<Leaderboard />} />
            <Route path="/mentor/rewards" element={<Rewards />} />
            <Route path="/mentor/promotions" element={<Promotions />} />
            <Route path="/mentor/spec" element={<MentorSpec />} />
            <Route path="/mentor/library" element={<Documents />} />
            <Route path="/mentor/mentee/:id" element={<MenteeProfile />} />

            {/* Mentee */}
            <Route path="/mentee/this-week" element={<ThisWeek />} />
            <Route path="/mentee/log" element={<DailyLog />} />
            <Route path="/mentee/task/:id" element={<TaskDetail />} />
            <Route path="/mentee/progress" element={<MyProgress />} />
            <Route path="/mentee/blockers" element={<Blockers />} />
            <Route path="/mentee/meetings" element={<Meetings />} />
            <Route path="/mentee/community" element={<Community />} />

            {/* Admin */}
            <Route path="/admin/health" element={<ProgramHealth />} />
            <Route path="/admin/clans" element={<Clans />} />
            <Route path="/admin/people" element={<People />} />
            {/* admin-scoped profile so opening a person keeps the admin shell */}
            <Route path="/admin/people/:id" element={<MenteeProfile />} />
            <Route path="/admin/requests" element={<ClanRequests />} />
            <Route path="/admin/insights" element={<OrgInsights />} />
            <Route path="/admin/announcements" element={<Announcements />} />
            <Route path="/admin/library" element={<Documents />} />
            <Route path="/admin/release-notes" element={<ReleaseNotes />} />

            <Route path="*" element={<Navigate to="/mentor/cockpit" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  );
}
