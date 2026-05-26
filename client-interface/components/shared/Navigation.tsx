'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { UserRole } from '@/lib/types';
import {
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { getNavigationLinks, NavLink } from '@/lib/config/navigation';
import { NotificationDrawer } from './NotificationDrawer';
import { UserProfileCard } from './UserProfileCard';
import { messagingApi } from '@/lib/services/messaging-api';
import { io } from 'socket.io-client';

interface NavigationProps {
  role: UserRole;
}

/** Returns true if pathname matches a link or any of its children */
function isLinkActive(link: NavLink, pathname: string): boolean {
  if (link.children) {
    return link.children.some((c) => pathname.startsWith(c.path));
  }
  return pathname === link.path;
}

export default function Navigation({ role }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const links = getNavigationLinks(role);

  // ── Collapsible group state ───────────────────────────────────────────────
  // Initialise with any group that contains the current path already open
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    links.forEach((link) => {
      if (link.children?.some((c) => pathname.startsWith(c.path))) {
        initial.add(link.path);
      }
    });
    return initial;
  });

  const toggleGroup = (path: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  // Auto-open group when navigating directly to a child route
  useEffect(() => {
    links.forEach((link) => {
      if (link.children?.some((c) => pathname.startsWith(c.path))) {
        setOpenGroups((prev) => new Set([...prev, link.path]));
      }
    });
  }, [pathname]);

  // ── Unread message count ──────────────────────────────────────────────────
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

  useEffect(() => {
    if (!user?.id) return;
    const socketUrl = apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl;
    const socket = io(socketUrl, { auth: { token: localStorage.getItem('token') } });

    socket.on('notification:new', (data: { type?: string }) => {
      if (data?.type === 'message') setUnreadMessageCount((p) => p + 1);
    });
    socket.on('message:unread-count', () => {
      messagingApi.listConversations(50).then((convs) => {
        setUnreadMessageCount(convs.reduce((s, c) => s + (c.unreadCount || 0), 0));
      }).catch(() => {});
    });

    return () => { socket.disconnect(); };
  }, [user?.id, apiBaseUrl]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // ── Shared render helpers ─────────────────────────────────────────────────

  const renderFlatLink = (link: NavLink, onNavigate?: () => void) => {
    const Icon = link.icon;
    const isActive = pathname === link.path;
    return (
      <Link
        key={link.path}
        href={link.path}
        onClick={onNavigate}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
          isActive
            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
        <span className="text-sm font-medium">{link.label}</span>
        {link.hasBadge && unreadMessageCount > 0 && (
          <span className="absolute right-3 inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full">
            {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
          </span>
        )}
      </Link>
    );
  };

  const renderGroupLink = (link: NavLink, onNavigate?: () => void) => {
    const Icon = link.icon;
    const isOpen = openGroups.has(link.path);
    const isGroupActive = link.children?.some((c) => pathname.startsWith(c.path)) ?? false;

    return (
      <div key={link.path}>
        {/* Group trigger */}
        <button
          onClick={() => toggleGroup(link.path)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
            isGroupActive && !isOpen
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Icon className={`w-4.5 h-4.5 shrink-0 ${isGroupActive && !isOpen ? 'text-indigo-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
          <span className="text-sm font-medium flex-1 text-left">{link.label}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Children */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="ml-3 mt-1 pl-4 border-l-2 border-slate-100 space-y-0.5 pb-1">
            {link.children?.map((child) => {
              const ChildIcon = child.icon;
              const isActive = pathname.startsWith(child.path);
              return (
                <Link
                  key={child.path}
                  href={child.path}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <ChildIcon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'}`} />
                  <span className="text-sm font-medium">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderNavItems = (onNavigate?: () => void) =>
    links.map((link) =>
      link.children
        ? renderGroupLink(link, onNavigate)
        : renderFlatLink(link, onNavigate)
    );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-100">
        <div className="flex flex-col flex-1 overflow-y-auto">

          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
            <div className="flex items-center justify-center w-9 h-9 bg-indigo-600 rounded-xl shadow-sm shadow-indigo-200">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pathment</div>
              <div className="text-slate-400 text-xs capitalize">{role} portal</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {renderNavItems()}
          </nav>

          {/* Bottom Section */}
          <div className="px-3 py-4 border-t border-slate-100 space-y-1">
            <UserProfileCard />
            <div className="relative mt-2">
              {user?.id && (
                <NotificationDrawer userId={user.id} apiBaseUrl={apiBaseUrl} showLabel />
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left group"
            >
              <LogOut className="w-4 h-4 group-hover:text-red-500" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Header ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-100 z-60">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 bg-indigo-600 rounded-xl shadow-sm shadow-indigo-200">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pathment</div>
              <div className="text-slate-400 text-xs capitalize">{role}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {user?.id && (
              <NotificationDrawer userId={user.id} apiBaseUrl={apiBaseUrl} />
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-100 bg-white">
            <nav className="px-3 py-3 space-y-0.5">
              {renderNavItems(() => setMobileMenuOpen(false))}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </nav>
          </div>
        )}
      </div>
    </>
  );
}

export { Navigation };