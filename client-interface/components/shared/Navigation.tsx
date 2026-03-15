'use client';

import React, { useState, useEffect } from 'react';
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
  Trophy,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  LucideIcon
} from 'lucide-react';
import { NotificationDrawer } from './NotificationDrawer';
import { UserProfileCard } from './UserProfileCard';
import { messagingApi } from '@/lib/services/messaging-api';
import { io } from 'socket.io-client';

interface NavigationProps {
  role: UserRole;
}

interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  hasBadge?: boolean;
}

export default function Navigation({ role }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const adminLinks: NavLink[] = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/programs/list', icon: BookOpen, label: 'Programs' },
    { path: '/admin/matching/mentor-assignment', icon: UserCheck, label: 'Mentors' },
    { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments' },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
  ];

  const mentorLinks: NavLink[] = [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentor/programs', icon: BookOpen, label: 'My Programs' },
    { path: '/mentor/mentees', icon: Users, label: 'My Mentees' },
    { path: '/mentor/tasks', icon: ClipboardList, label: 'Tasks' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
  ];

  const menteeLinks: NavLink[] = [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentee/programs', icon: BookOpen, label: 'Browse Programs' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/gamification', icon: Trophy, label: 'Gamification' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
  ];

  const links = role === 'admin' ? adminLinks : role === 'mentor' ? mentorLinks : menteeLinks;

  // Fetch unread message count from conversation list (initial load + on route change).
  useEffect(() => {
    if (!user?.id) return;

    messagingApi.listConversations(50).then((conversations) => {
      const total = conversations.reduce(
        (sum, conversation) => sum + (conversation.unreadCount || 0),
        0
      );
      setUnreadMessageCount(total);
    }).catch(() => {});
  }, [user?.id, pathname]);

  // Real-time badge updates via socket.
  // NOTE: message:new is emitted to conversation rooms — Navigation never joins those.
  // Instead we use notification:new (type='message') which IS sent to the user room,
  // and message:unread-count which fires after a conversation is marked as read.
  useEffect(() => {
    if (!user?.id) return;

    const socketUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;

    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem('token') }
    });

    const handleNotificationNew = (data: { type?: string }) => {
      if (data?.type === 'message') {
        setUnreadMessageCount((prev) => prev + 1);
      }
    };

    const handleUnreadCountReset = () => {
      messagingApi.listConversations(50).then((conversations) => {
        const total = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        setUnreadMessageCount(total);
      }).catch(() => {});
    };

    socket.on('notification:new', handleNotificationNew);
    socket.on('message:unread-count', handleUnreadCountReset);

    return () => {
      socket.off('notification:new', handleNotificationNew);
      socket.off('message:unread-count', handleUnreadCountReset);
      socket.disconnect();
    };
  }, [user?.id, apiBaseUrl]);

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
            {links.map((link: NavLink) => {
              const Icon = link.icon;
              const isActive = pathname === link.path;
              
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{link.label}</span>
                  {link.hasBadge && unreadMessageCount > 0 && (
                    <span className="absolute right-3 flex items-center justify-center min-w-6 h-6 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                      {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="px-4 py-4 border-t border-slate-200 space-y-3 flex flex-col">
            {/* User Profile Card */}
            <UserProfileCard />
            
            <div className="relative flex items-center gap-2">
              {user?.id && (
                <NotificationDrawer userId={user.id} apiBaseUrl={apiBaseUrl} showLabel />
              )}
            </div>
            <Link 
              href={`/${role}/settings`}
              className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors ${
                pathname === `/${role}/settings`
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-60">
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

          <div className="relative flex items-center gap-2">
            {user?.id && (
              <NotificationDrawer userId={user.id} apiBaseUrl={apiBaseUrl} />
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white">
            <nav className="px-4 py-4 space-y-1">
              {links.map((link: NavLink) => {
                const Icon = link.icon;
                const isActive = pathname === link.path;
                
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                    {link.hasBadge && unreadMessageCount > 0 && (
                      <span className="absolute right-3 flex items-center justify-center min-w-6 h-6 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                        {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <Link 
                href={`/${role}/settings`}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors ${
                  pathname === `/${role}/settings`
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
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
