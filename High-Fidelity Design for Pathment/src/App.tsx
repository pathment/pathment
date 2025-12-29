import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Register from './components/auth/Register';
import Login from './components/auth/Login';
import EmailVerification from './components/auth/EmailVerification';
import PasswordReset from './components/auth/PasswordReset';
import AdminDashboard from './components/admin/AdminDashboard';
import ProgramCreate from './components/admin/ProgramCreate';
import ProgramList from './components/admin/ProgramList';
import ProgramDetails from './components/admin/ProgramDetails';
import RoadmapGenerator from './components/admin/RoadmapGenerator';
import MentorAssignment from './components/admin/MentorAssignment';
import EnrollmentOverview from './components/admin/EnrollmentOverview';
import MenteeDashboard from './components/mentee/MenteeDashboard';
import ProgramEnrollment from './components/mentee/ProgramEnrollment';
import TaskList from './components/mentee/TaskList';
import TaskSubmission from './components/mentee/TaskSubmission';
import FeedbackView from './components/mentee/FeedbackView';
import MentorDashboard from './components/mentor/MentorDashboard';
import TaskAssignment from './components/mentor/TaskAssignment';
import ReviewQueue from './components/mentor/ReviewQueue';
import FeedbackProvision from './components/mentor/FeedbackProvision';

export default function App() {
  const [user, setUser] = useState<any>(null);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/verify-email" element={<EmailVerification />} />
        <Route path="/reset-password" element={<PasswordReset />} />
        
        {/* Admin Routes */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/programs/create" element={<ProgramCreate />} />
        <Route path="/admin/programs" element={<ProgramList />} />
        <Route path="/admin/programs/:id" element={<ProgramDetails />} />
        <Route path="/admin/programs/:id/roadmap" element={<RoadmapGenerator />} />
        <Route path="/admin/mentors/assign" element={<MentorAssignment />} />
        <Route path="/admin/enrollments" element={<EnrollmentOverview />} />
        
        {/* Mentee Routes */}
        <Route path="/mentee/dashboard" element={<MenteeDashboard />} />
        <Route path="/mentee/programs/:id/enroll" element={<ProgramEnrollment />} />
        <Route path="/mentee/tasks" element={<TaskList />} />
        <Route path="/mentee/tasks/:id/submit" element={<TaskSubmission />} />
        <Route path="/mentee/feedback/:id" element={<FeedbackView />} />
        
        {/* Mentor Routes */}
        <Route path="/mentor/dashboard" element={<MentorDashboard />} />
        <Route path="/mentor/tasks/assign" element={<TaskAssignment />} />
        <Route path="/mentor/tasks/review" element={<ReviewQueue />} />
        <Route path="/mentor/tasks/:id/feedback" element={<FeedbackProvision />} />
      </Routes>
    </Router>
  );
}
