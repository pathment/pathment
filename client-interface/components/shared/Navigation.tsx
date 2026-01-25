'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { UserRole } from '@/lib/types';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  UserCheck, 
  ClipboardList,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';

interface NavigationProps {
  role: UserRole;
}

export default function Navigation({ role }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const adminLinks = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/programs/list', icon: BookOpen, label: 'Programs' },
    { path: '/admin/matching/mentor-assignment', icon: UserCheck, label: 'Mentors' },
    { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments' },
  ];

  const mentorLinks = [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentor/tasks/assign', icon: ClipboardList, label: 'Assign Tasks' },
    { path: '/mentor/tasks/review', icon: MessageSquare, label: 'Review Queue' },
  ];

  const menteeLinks = [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentee/programs', icon: BookOpen, label: 'Browse Programs' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
  ];

  const links = role === 'admin' ? adminLinks : role === 'mentor' ? mentorLinks : menteeLinks;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-200">
            <div className="flex items-center justify-center w-10 h-10 bg-indigo-600 rounded-xl">
              <span className="text-white font-bold">P</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Pathment</div>
              <div className="text-slate-500 text-xs capitalize">{role} Portal</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.path;
              
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="px-4 py-4 border-t border-slate-200 space-y-1">
            <button className="flex items-center gap-3 px-4 py-3 w-full text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-[60]">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-indigo-600 rounded-xl">
              <span className="text-white font-bold">P</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Pathment</div>
              <div className="text-slate-500 text-xs capitalize">{role}</div>
            </div>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white">
            <nav className="px-4 py-4 space-y-1">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.path;
                
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
              <button className="flex items-center gap-3 px-4 py-3 w-full text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </button>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        )}
      </div>
    </>
  );
}

export { Navigation };
