import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, Settings, ChevronsUpDown, Menu, X, Command } from 'lucide-react';
import { NAV, ROLE_LABEL } from './nav';
import type { Role } from '@/lib/types';
import { useStore } from '@/store/AppStore';
import { CURRENT_MENTEE } from '@/data/mock';
import { Avatar, cx } from '@/lib/ui';
import { Toaster } from './Toaster';
import { ChainAdvanceModal } from './ChainAdvanceModal';
import { NotificationsMenu } from './NotificationsMenu';
import { CommandPalette } from './CommandPalette';
import { AssignTaskDrawer } from './AssignTaskDrawer';
import { OneOnOneDrawer } from './OneOnOneDrawer';

/* ---- global UI actions any page can trigger (fewer clicks) ---- */
interface AppActions {
  assign: (menteeId?: number) => void;
  log1on1: (menteeId: number) => void;
}
const ActionsContext = createContext<AppActions | null>(null);
export function useAppActions(): AppActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useAppActions must be used within AppShell');
  return ctx;
}

const ROLE_HOME: Record<Role, string> = {
  mentor: '/mentor/cockpit',
  mentee: '/mentee/this-week',
  admin: '/admin/health',
};

function useRole(): Role {
  const { pathname } = useLocation();
  if (pathname.startsWith('/mentee')) return 'mentee';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'mentor';
}

function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { mentees, mentor } = useStore();
  const items = NAV[role];

  const pendingApprovals = mentees.reduce((n, m) => n + m.pendingApprovals, 0);
  const atRiskCount = mentees.filter((m) => m.risk !== 'low').length;

  const goRole = (r: Role) => {
    navigate(ROLE_HOME[r]);
    onNavigate?.();
  };

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="rounded-r grid h-8 w-8 place-items-center bg-ink font-mono text-sm font-bold text-white">
          P
        </div>
        <div className="leading-tight">
          <div className="font-mono text-sm font-semibold tracking-wider text-ink">PATHMENT</div>
          <div className="text-[11px] text-ink-faint">Workspace</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="eyebrow mb-2 px-2">Platform</div>
        <div className="grid grid-cols-3 gap-1 border border-hairline p-1">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => goRole(r)}
              className={cx(
                'rounded-r py-1.5 text-xs font-medium transition-all',
                r === role ? 'bg-ink text-white' : 'text-ink-mute hover:text-ink',
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {items.map((item) => {
          const count =
            item.badge === 'approvals' ? pendingApprovals : item.badge === 'risk' ? atRiskCount : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'rounded-r group flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-neutral-100 text-ink' : 'text-ink-mute hover:bg-neutral-50 hover:text-ink',
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {count > 0 && (
                <span
                  className={cx(
                    'rounded-r border px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                    item.badge === 'risk' ? 'border-rose-200 text-[#FF3B30]' : 'border-brand-200 text-brand-700',
                  )}
                >
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="rounded-r mt-2 flex items-center gap-2.5 border border-hairline bg-white px-2.5 py-2">
        {role === 'mentee' ? (
          <Avatar initials={CURRENT_MENTEE.avatar} name={CURRENT_MENTEE.name} size="sm" />
        ) : (
          <Avatar initials={mentor.avatar} name={mentor.name} size="sm" />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-xs font-semibold text-ink">
            {role === 'mentee' ? CURRENT_MENTEE.name : mentor.name}
          </div>
          <div className="truncate text-[11px] text-ink-faint">
            {role === 'mentee' ? 'Mentee' : role === 'admin' ? 'Super Admin' : mentor.role}
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-ink-faint" />
      </div>
    </>
  );
}

function Topbar({
  role,
  onMenu,
  onAssign,
  onPalette,
}: {
  role: Role;
  onMenu: () => void;
  onAssign: () => void;
  onPalette: () => void;
}) {
  const navigate = useNavigate();
  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hairline px-4 sm:px-5">
      <button
        onClick={onMenu}
        className="rounded-r grid h-9 w-9 place-items-center text-ink-mute hover:bg-neutral-100 hover:text-ink lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* command-palette trigger (replaces the dead search box) */}
      <button
        onClick={onPalette}
        className="rounded-r hidden max-w-md flex-1 items-center gap-2.5 border border-hairline bg-white/70 px-3 py-2 text-left text-sm text-ink-faint transition-colors hover:border-ink sm:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1">
          {role === 'mentee' ? 'Search your tasks…' : 'Search or jump to…'}
        </span>
        <kbd className="rounded-r flex items-center gap-0.5 border border-hairline px-1.5 py-0.5 font-mono text-[10px]">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        {role !== 'mentee' && (
          <button
            onClick={onAssign}
            className="rounded-r hidden items-center gap-2 border border-ink bg-ink px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 sm:inline-flex"
          >
            <Plus className="h-4 w-4" />
            {role === 'admin' ? 'New clan' : 'Assign task'}
          </button>
        )}
        <NotificationsMenu role={role} />
        {role === 'mentor' && (
          <button
            onClick={() => navigate('/mentor/settings')}
            className="rounded-r inline-flex h-9 w-9 items-center justify-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </header>
  );
}

export function AppShell() {
  const role = useRole();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // global drawers driven by app actions / command palette
  const [assignFor, setAssignFor] = useState<number | undefined>(undefined);
  const [assignOpen, setAssignOpen] = useState(false);
  const [oneOnOneFor, setOneOnOneFor] = useState<number | null>(null);

  const assign = useCallback((menteeId?: number) => {
    setAssignFor(menteeId);
    setAssignOpen(true);
  }, []);
  const log1on1 = useCallback((menteeId: number) => setOneOnOneFor(menteeId), []);

  const { getMentee } = useStore();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <ActionsContext.Provider value={{ assign, log1on1 }}>
      <div className="flex h-full">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-white/60 px-3 py-4 lg:flex">
          <SidebarContent role={role} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-ink/20 animate-fade-in" onClick={() => setMobileOpen(false)} />
            <aside
              className="relative flex w-64 max-w-[80%] flex-col border-r border-hairline bg-white px-3 py-4 shadow-lift animate-slide-in"
              style={{ animationDuration: '0.24s' }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-r absolute right-3 top-4 grid h-8 w-8 place-items-center text-ink-mute hover:bg-neutral-100 hover:text-ink"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent role={role} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            role={role}
            onMenu={() => setMobileOpen(true)}
            onAssign={() => assign()}
            onPalette={() => {
              const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
              window.dispatchEvent(ev);
            }}
          />
          <main className="scrollbar-thin flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* global overlays */}
      <CommandPalette onAssign={assign} onLog1on1={log1on1} />
      <AssignTaskDrawer open={assignOpen} onClose={() => setAssignOpen(false)} menteeId={assignFor} />
      <OneOnOneDrawer
        open={oneOnOneFor !== null}
        onClose={() => setOneOnOneFor(null)}
        mentee={oneOnOneFor !== null ? getMentee(oneOnOneFor) ?? null : null}
      />
      <ChainAdvanceModal />
      <Toaster />
    </ActionsContext.Provider>
  );
}
