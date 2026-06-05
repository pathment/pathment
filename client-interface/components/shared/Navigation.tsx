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
  Pin,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Check,
  Settings,
} from 'lucide-react';
import { NavLink } from '@/lib/config/navigation';
import { useNavPreferences } from '@/lib/hooks/shared';
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
  const { logout, user, availableRoles, setActiveRole } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const { links, pinned, isEditing, toggleEdit, togglePin, moveUp, moveDown, reset, recordUsage } = useNavPreferences(role);

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

  // ── Role switcher (multi-capability users) ────────────────────────────────
  const switchRole = (target: UserRole) => {
    if (target === role) return;
    setActiveRole(target);
    setMobileMenuOpen(false);
    router.push(`/${target}/dashboard`);
  };

  const renderRoleSwitcher = () => {
    if (!availableRoles || availableRoles.length <= 1) return null;
    const order: UserRole[] = ['admin', 'mentor', 'mentee'];
    const roles = order.filter((r) => availableRoles.includes(r));
    return (
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {roles.map((r) => (
          <button
            key={r}
            onClick={() => switchRole(r)}
            className={`flex-1 text-xs font-medium capitalize px-2 py-1.5 rounded-lg transition-all duration-150 ${
              r === role
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };

  // ── Shared render helpers ─────────────────────────────────────────────────

  const renderFlatLink = (link: NavLink, onNavigate?: () => void) => {
    const Icon = link.icon;
    const isActive = pathname === link.path;
    return (
      <Link
        key={link.path}
        href={link.path}
        onClick={() => { recordUsage(link.path); onNavigate?.(); }}
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
                  onClick={() => { recordUsage(child.path); onNavigate?.(); }}
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

  // Reorder/pin row shown in edit mode (no navigation).
  const renderEditRow = (link: NavLink) => {
    const Icon = link.icon;
    const isPinned = pinned.has(link.path);
    return (
      <div key={link.path} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-100">
        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm font-medium text-slate-700 flex-1 truncate">{link.label}</span>
        <button onClick={() => togglePin(link.path)} title={isPinned ? 'Unpin' : 'Pin to top'}
          className={`p-1 rounded ${isPinned ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}>
          <Pin className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => moveUp(link.path)} title="Move up" className="p-1 text-slate-400 hover:text-slate-700"><ArrowUp className="w-3.5 h-3.5" /></button>
        <button onClick={() => moveDown(link.path)} title="Move down" className="p-1 text-slate-400 hover:text-slate-700"><ArrowDown className="w-3.5 h-3.5" /></button>
      </div>
    );
  };

  const renderNavItems = (onNavigate?: () => void) =>
    isEditing
      ? links.map((link) => renderEditRow(link))
      : links.map((link) =>
          link.children
            ? renderGroupLink(link, onNavigate)
            : renderFlatLink(link, onNavigate)
        );

  // Small header above the nav list to enter/exit customize mode + reset.
  const renderNavHeader = () => (
    <div className="flex items-center justify-between px-2 mb-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{isEditing ? 'Customize menu' : 'Menu'}</span>
      <div className="flex items-center gap-1">
        {isEditing && (
          <button onClick={reset} className="text-[11px] text-slate-400 hover:text-slate-600">Reset</button>
        )}
        <button onClick={toggleEdit} title={isEditing ? 'Done' : 'Customize'}
          className={`p-1 rounded-lg ${isEditing ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
          {isEditing ? <Check className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-100">
        <div className="flex flex-col flex-1 overflow-y-auto">

          {/* Logo + quick actions (notifications & settings, always visible) */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100">
            <div className="flex items-center justify-center w-9 h-9 bg-indigo-600 rounded-xl shadow-sm shadow-indigo-200 shrink-0">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm truncate">Pathment</div>
              <div className="text-slate-400 text-xs capitalize truncate">{role} portal</div>
            </div>
            <div className="ml-auto flex items-center gap-0.5 shrink-0">
              {user?.id && <NotificationDrawer userId={user.id} apiBaseUrl={apiBaseUrl} />}
              <Link
                href={`/${role}/settings`}
                title="Settings"
                aria-label="Settings"
                className={`p-2 rounded-xl transition-colors ${pathname.startsWith(`/${role}/settings`) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                <Settings className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Role switcher (only for users who hold more than one role view) */}
          {availableRoles && availableRoles.length > 1 && (
            <div className="px-3 pt-3">{renderRoleSwitcher()}</div>
          )}

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {renderNavHeader()}
            {renderNavItems()}
          </nav>

          {/* Bottom Section */}
          <div className="px-3 py-4 border-t border-slate-100 space-y-1">
            <UserProfileCard />
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
            <Link
              href={`/${role}/settings`}
              title="Settings"
              aria-label="Settings"
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Link>
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
              {availableRoles && availableRoles.length > 1 && (
                <div className="pb-2">{renderRoleSwitcher()}</div>
              )}
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