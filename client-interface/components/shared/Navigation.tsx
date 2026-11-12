'use client';
import { matchesAdminTab } from '@/lib/config/adminWorkspaces';

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
  HelpCircle,
  MessageSquarePlus,
  ShieldCheck,
  Search,
  TerminalSquare,
} from 'lucide-react';
import { NavLink } from '@/lib/config/navigation';
import { useNavPreferences } from '@/lib/hooks/shared';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { platformApi } from '@/lib/services/platform-api';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useClan, ALL_CLANS, poolScope, type ClanLite, type PoolLite } from '@/lib/context/ClanContext';
import { useMenteeScope } from '@/lib/hooks/mentee';
import { useNavBadges } from '@/lib/hooks/shared/useNavBadges';
import { SelectMenu } from './SelectMenu';
import { ClanAvatar } from './ClanAvatar';
import { CommandPalette } from './CommandPalette';
import { LiveMeetingBanner } from './LiveMeetingBanner';
import { FeedbackDrawer } from './FeedbackDrawer';
import { NotificationDrawer } from './NotificationDrawer';
import { ChangelogDrawer } from './ChangelogDrawer';
import { UserProfileCard } from './UserProfileCard';
import { logicalPathname, workspacePath } from '@/lib/services/workspace-scope';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface NavigationProps {
  role: UserRole;
}

/** Returns true if pathname matches a link or any of its children */
function isLinkActive(link: NavLink, pathname: string): boolean {
  if (link.children) {
    return link.children.some((c) => pathname.startsWith(c.path));
  }
  return (link.activePaths ?? [link.path]).some((path) => matchesAdminTab(pathname, path));
}

export default function Navigation({ role }: NavigationProps) {
  const pathname = logicalPathname(usePathname());
  const router = useRouter();
  const { logout, user, availableRoles, setActiveRole } = useAuth();
  const { clans, activeClanId, setActiveClanId, menteeClans, menteePools, menteeScope, setMenteeScope, menteeActiveClanId } = useClan();
  const scope = useMenteeScope();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const { links, pinned, isEditing, toggleEdit, togglePin, moveUp, moveDown, reset, recordUsage, adaptive, toggleAdaptive } = useNavPreferences(role);
  const { can, canAny, canAccessAdmin, canAccessPools, loading: permsLoading } = usePermissions();

  // Platform console entry: shown only to platform operators (platform_admins
  // rows / env bootstrap), resolved once and cached. Workspace roles never
  // grant it, and for everyone else the sidebar simply never mentions it.
  const { data: platformMe } = useApiQuery({
    queryKey: qk.platform.me,
    queryFn: platformApi.me,
    enabled: Boolean(user?.id),
    staleTime: STALE.long,
  });
  const isPlatformAdmin = Boolean(platformMe?.isPlatformAdmin);

  const renderPlatformConsoleLink = (onNavigate?: () => void) => isPlatformAdmin ? (
    <Link
      href="/platform"
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left group ${
        pathname.startsWith('/platform')
          ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
          : 'text-slate-500 hover:text-brand-700 hover:bg-brand-50'
      }`}
    >
      <TerminalSquare className="w-4 h-4 text-slate-400 group-hover:text-brand-500" />
      <span className="text-sm font-medium">Platform console</span>
    </Link>
  ) : null;

  // Permission-filtered nav: hide items the user can't use, drop empty groups,
  // and surface an "Admin area" entry for org/program admins in their own nav.
  // While permissions load, show everything (no flicker for full admins).
  const visibleLinks = React.useMemo<NavLink[]>(() => {
    const base = permsLoading
      ? links
      : links
          .map((link) => {
            if (link.requiresAdminArea && !canAccessAdmin) return null;
            if (link.children) {
              const kids = link.children.filter((c) => (!c.permission || can(c.permission)) && (!c.anyOf || canAny(c.anyOf)));
              if (!kids.length) return null;
              if (link.workspace) return { ...link, preferenceKey: link.path, path: kids[0].path, activePaths: kids.map((child) => child.path), children: undefined };
              return { ...link, children: kids };
            }
            const okPerm = !link.permission || can(link.permission);
            const okAny = !link.anyOf || canAny(link.anyOf);
            return okPerm && okAny ? link : null;
          })
          .filter((l): l is NavLink => Boolean(l));

    if (role !== 'admin' && canAccessAdmin) {
      return [...base, { path: '/admin', icon: ShieldCheck, label: 'Admin area', requiresAdminArea: true }];
    }
    // A pool reviewer/operator who is not an admin: their one way into the
    // admin area is Selection pools, and that is all it shows them.
    if (role !== 'admin' && canAccessPools) {
      return [...base, { path: '/admin/pools', icon: ShieldCheck, label: 'Selection pools' }];
    }
    return base;
  }, [links, permsLoading, canAccessAdmin, canAccessPools, can, canAny, role]);

  /**
   * What a candidate in a selection pool actually has.
   *
   * In pool scope there is no mentor, no roadmap, no clan and no cohort, so
   * progress, meetings, roadblocks, the community and the message centre are
   * not empty screens — they are screens about things that do not exist until
   * they are placed. Hiding them is the difference between a product that is
   * clear about where somebody is and one that looks broken.
   *
   * It is the SCOPE that decides, not the account: somebody in a clan who is
   * also in a second round gets the full workspace back by switching scope.
   */
  const navLinks = React.useMemo<NavLink[]>(() => {
    if (role !== 'mentee' || !scope.inPool) return visibleLinks;
    const KEEP = new Set(['/mentee/dashboard', '/mentee/tasks', '/mentee/settings']);
    return visibleLinks
      .map((link) => {
        if (!link.children) {
          if (!KEEP.has(link.path)) return null;
          // The learner groups arrive flattened, so "My learning" is a single
          // link at /mentee/tasks that still claims the roadmap and library as
          // its own. In a round there are neither, and it is qualifying work
          // rather than a curriculum, so it is named for what it is.
          return link.path === '/mentee/tasks'
            ? { ...link, label: 'My work', activePaths: ['/mentee/tasks'] }
            : link;
        }
        const kids = link.children.filter((c) => KEEP.has(c.path));
        if (!kids.length) return null;
        return link.workspace
          ? { ...link, preferenceKey: link.path, path: kids[0].path, activePaths: kids.map((c) => c.path), children: undefined }
          : { ...link, children: kids };
      })
      .filter((l): l is NavLink => Boolean(l));
  }, [visibleLinks, role, scope.inPool]);

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
      if (next.has(path)) next.delete(path);
      else next.add(path);
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
  }, [pathname, links]);

  // The badge follows the sidebar clan picker so it always matches the page:
  // 'All clans' = the full queue, otherwise just that clan's share.
  const isMentorNav = role === 'mentor';
  const { unreadMessageCount, approvalCounts } = useNavBadges({
    userId: user?.id,
    isMentor: isMentorNav,
    portal: role,
    activeClanId,
    menteeActiveClanId,
  });
  const approvalsBadgeCount = activeClanId === ALL_CLANS
    ? approvalCounts.total
    : (approvalCounts.byClan[activeClanId] || 0);

  const handleLogout = async () => {
    await logout();
    router.push(workspacePath('/login'));
  };

  // ── Role switcher (multi-capability users) ────────────────────────────────
  const switchRole = (target: UserRole) => {
    if (target === role) return;
    setActiveRole(target);
    setMobileMenuOpen(false);
    router.push(workspacePath(`/${target}/dashboard`));
  };

  const renderRoleSwitcher = () => {
    if (!availableRoles || availableRoles.length <= 1) return null;
    const order: UserRole[] = ['admin', 'mentor', 'mentee'];
    // Only the three portal roles switch; other capabilities (a selection-pool
    // candidate) have their own area and never appear here.
    const roles = order.filter((r) => availableRoles.includes(r));
    if (roles.length <= 1) return null;
    return (
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {roles.map((r) => (
          <button
            key={r}
            onClick={() => switchRole(r)}
            className={`flex-1 text-xs font-medium capitalize px-2 py-1.5 rounded-lg transition-all duration-150 ${
              r === role
                ? 'bg-card text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };

  // ── Clan scope (multi-clan mentors / mentees) ─────────────────────────────
  /**
   * One row per clan, grouped by what the clan IS rather than sorted by it.
   *
   * A clan from a closed programme stays in this list on purpose. It is the
   * only way to scope the rest of the app — Approvals, Mentees, Review — to
   * that clan, which is exactly how somebody looks back at what happened
   * there, and the app already enforces read-only on that scope
   * (`isHistoricalCohortClan`). Taking it out of the picker would not archive
   * the work, it would just make it unreachable.
   *
   * What it must not do is sit in the same list as live work with no visible
   * difference. So it goes under its own heading, below everything current,
   * marked read-only.
   */
  const clanGroupOf = (c: ClanLite) => (
    c.kind === 'standing' ? 'Standing clans'
      : c.frozenAt ? 'Past programmes'
        : 'Active programme'
  );
  // Current work first, history last; alphabetical inside each group.
  const GROUP_ORDER = ['Active programme', 'Standing clans', 'Past programmes'];
  const clanOptions = (list: ClanLite[]) => [...list]
    .sort((a, b) => GROUP_ORDER.indexOf(clanGroupOf(a)) - GROUP_ORDER.indexOf(clanGroupOf(b))
      || a.name.localeCompare(b.name))
    .map((c) => ({
      value: c.id,
      // The clan's own name owns the full width. Everything that qualifies it
      // moves to the second line, where it no longer competes for room.
      label: c.name,
      description: c.kind === 'standing'
        ? `Standing${c.programName ? ` · ${c.programName}` : ''}`
        : c.frozenAt
          ? `${c.programName || 'Programme'} · finished`
          : c.programName || 'Active programme',
      group: clanGroupOf(c),
      meta: c.kind !== 'standing' && c.frozenAt ? 'Read-only' : undefined,
      icon: <ClanAvatar name={c.name} src={c.avatarUrl} size="sm" />,
    }));

  /**
   * The pools, as picker rows. Decided rounds sit below live ones and say so,
   * for the same reason a finished programme stays in a mentor's picker: it is
   * the only way back to what happened there.
   */
  const poolOptions = (list: PoolLite[]) => [...list]
    .sort((a, b) => Number(a.decided) - Number(b.decided) || a.name.localeCompare(b.name))
    .map((p) => ({
      value: poolScope(p.id),
      label: p.name,
      description: p.decided
        ? `${p.programName || 'Selection'} · decided`
        : p.status === 'closed'
          ? `${p.programName || 'Selection'} · closed`
          : p.programName || 'Qualifying round',
      group: 'Selection pool',
      meta: p.decided || p.status === 'closed' ? 'Read-only' : undefined,
      icon: <ClanAvatar name={p.name} src={p.avatarUrl} size="sm" />,
    }));

  const renderClanScope = () => {
    if (role === 'mentor' && clans.length >= 2) {
      return (
        /*
         * One clan at a time, deliberately.
         *
         * "All clans" merged every clan a mentor runs into a single view. That
         * is a reporting lens, not a place to work: the screens under it are
         * about one clan's roster, one clan's queue and one clan's team, so
         * half of them had to special-case the merged scope and the other half
         * quietly picked the first clan anyway. It was also where a mentor
         * landed by default, which meant the app opened on the one scope that
         * answers no question in particular.
         *
         * The picker now holds clans only. What a mentor last chose is
         * remembered per account (clan-choice), and a first visit lands on a
         * live clan (defaultClanOf).
         */
        <SelectMenu
          value={activeClanId}
          onChange={setActiveClanId}
          options={clanOptions(clans)}
          ariaLabel="Filter by clan"
          className="w-full"
        />
      );
    }
    if (role === 'mentee') {
      /*
       * A learner's picker holds their clans AND the selection pools they are
       * a candidate in, under a heading of its own.
       *
       * They are not the same kind of thing, which is exactly why the pool
       * needs its own group rather than a row that looks like a clan: the
       * workspace behaves differently in it (no mentor, no roadmap, fewer
       * tabs), and the heading is what tells somebody that before they click.
       *
       * Shown from one row, not two, when that row is a pool: a candidate with
       * no clan still needs to see where they are, and a pool is not the
       * obvious default the way a single clan is.
       */
      const options = [...clanOptions(menteeClans), ...poolOptions(menteePools)];
      if (options.length < 2 && !menteePools.length) return null;
      if (!options.length) return null;
      return (
        <SelectMenu
          value={menteeScope || options[0].value}
          onChange={setMenteeScope}
          options={options}
          ariaLabel={menteePools.length ? 'Switch clan or selection pool' : 'Switch clan'}
          className="w-full"
        />
      );
    }
    return null;
  };

  // ── Shared render helpers ─────────────────────────────────────────────────

  const renderFlatLink = (link: NavLink, onNavigate?: () => void) => {
    const Icon = link.icon;
    const isActive = isLinkActive(link, pathname);
    return (
      <Link
        key={link.path}
        href={workspacePath(link.path)}
        onClick={() => { recordUsage(link.preferenceKey ?? link.path); onNavigate?.(); }}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
          isActive
            ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'}`} />
        <span className="text-sm font-medium">{link.label}</span>
        {(() => {
          const count = link.badge === 'messages' ? unreadMessageCount
            : link.badge === 'approvals' ? approvalsBadgeCount
            : 0;
          if (!count) return null;
          // Approvals is a work queue, not an alert — keep red for unread
          // messages and use the brand colour here so it reads as "to do".
          const tone = link.badge === 'approvals' ? 'bg-brand-600' : 'bg-red-500';
          const label = link.badge === 'approvals'
            ? `${count} ${count === 1 ? 'submission' : 'submissions'} to review`
            : `${count} unread`;
          return (
            <span
              aria-label={label}
              title={label}
              className={`absolute right-3 inline-flex items-center justify-center min-w-5 h-5 px-1.5 ${tone} text-white text-[11px] font-bold rounded-full`}
            >
              {count > 99 ? '99+' : count}
            </span>
          );
        })()}
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
          data-tour={link.path}
          onClick={() => toggleGroup(link.path)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group ${
            isGroupActive && !isOpen
              ? 'bg-brand-50 text-brand-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Icon className={`w-4.5 h-4.5 shrink-0 ${isGroupActive && !isOpen ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
          <span className="text-sm font-medium flex-1 text-left">{link.label}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Children */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="ml-3 mt-1 pl-4 border-l-2 border-slate-100 space-y-0.5 pb-1">
            {link.children?.map((child) => {
              const ChildIcon = child.icon;
              const isActive = pathname.startsWith(child.path);
              return (
                <Link
                  key={child.path}
                  href={workspacePath(child.path)}
                  onClick={() => { recordUsage(child.path); onNavigate?.(); }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 group ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
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
          className={`p-1 rounded ${isPinned ? 'text-brand-600' : 'text-slate-300 hover:text-slate-500'}`}>
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
      : navLinks.map((link) =>
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
          <><label className="flex items-center gap-1 text-[10px] text-muted-foreground"><input type="checkbox" checked={adaptive} onChange={toggleAdaptive} />Auto-sort</label><button onClick={reset} className="text-[11px] text-slate-400 hover:text-slate-600">Reset</button></>
        )}
        <button onClick={toggleEdit} title={isEditing ? 'Done' : 'Customize'}
          className={`p-1 rounded-lg ${isEditing ? 'text-brand-600 bg-brand-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
          {isEditing ? <Check className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );

  const openSearch = () => window.dispatchEvent(new CustomEvent('pathment:open-search'));

  return (
    <>
      <CommandPalette role={role} />
      <FeedbackDrawer open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {/* Live-meeting join banner — appears for any role when an admin-hosted
          meeting they're invited to goes live. */}
      <LiveMeetingBanner />

      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-card border-r border-slate-100">
        <div className="flex flex-col flex-1 overflow-y-auto">

          {/* Brand — own row so the logo reads cleanly */}
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-tile.png" alt="Pathment" className="w-11 h-11 rounded-2xl shadow-sm shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-base leading-tight truncate">Pathment</div>
                <div className="text-slate-400 text-xs capitalize truncate">{role} portal</div>
              </div>
            </div>
          </div>

          {/* Quick actions — all four, evenly spaced below the logo */}
          <div className="flex items-center gap-1 px-3 pb-3 mb-1 border-b border-slate-100">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('pathment:start-tour'))}
              title="Take a tour"
              aria-label="Take a tour"
              className="flex-1 flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <span data-tour="whats-new" className="flex-1 flex justify-center">
              <ChangelogDrawer role={role} />
            </span>
            <span data-tour="notifications" className="flex-1 flex justify-center">
              {user?.id && <NotificationDrawer userId={user.id} />}
            </span>
            <span data-tour="feedback" className="flex-1 flex justify-center">
              <button
                onClick={() => setFeedbackOpen(true)}
                title="Send feedback / report a bug"
                aria-label="Send feedback"
                className="w-full flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <MessageSquarePlus className="w-5 h-5" />
              </button>
            </span>
            <Link
              href={workspacePath(`/${role}/settings`)}
              title="Settings"
              aria-label="Settings"
              className={`flex-1 flex items-center justify-center p-2 rounded-xl transition-colors ${pathname.startsWith(`/${role}/settings`) ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>

          {/* Role switcher (only for users who hold more than one role view) */}
          <div className="px-3 pt-3"><WorkspaceSwitcher /></div>

          {renderRoleSwitcher() && (
            <div className="px-3 pt-3">{renderRoleSwitcher()}</div>
          )}

          {/* Clan scope (multi-clan mentors) — sits right under the role switch */}
          {renderClanScope() && <div className="px-3 pt-2">{renderClanScope()}</div>}

          {/* Quick search (⌘K) */}
          <div className="px-3 pt-3">
            <button
              onClick={openSearch}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="text-sm flex-1 text-left">Search…</span>
              <kbd className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {renderNavHeader()}
            {renderNavItems()}
          </nav>

          {/* Bottom Section */}
          <div className="px-3 py-4 border-t border-slate-100 space-y-1">
            {renderPlatformConsoleLink()}
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
      <div className="lg:hidden fixed top-0 left-0 right-0 glass border-b border-slate-100 dark:border-slate-700 z-60">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-tile.png" alt="Pathment" className="w-10 h-10 rounded-2xl shadow-sm" />
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pathment</div>
              <div className="text-slate-400 text-xs capitalize">{role}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={openSearch}
              title="Search"
              aria-label="Search"
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            {user?.id && (
              <NotificationDrawer userId={user.id} />
            )}
            <Link
              href={workspacePath(`/${role}/settings`)}
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
          <div className="border-t border-slate-100 bg-card">
            <nav className="px-3 py-3 space-y-0.5">
              <div className="pb-3"><WorkspaceSwitcher compact onNavigate={() => setMobileMenuOpen(false)} /></div>
              {renderRoleSwitcher() && (
                <div className="pb-2">{renderRoleSwitcher()}</div>
              )}
              {renderClanScope() && <div className="pb-2">{renderClanScope()}</div>}
              {renderNavItems(() => setMobileMenuOpen(false))}
              {renderPlatformConsoleLink(() => setMobileMenuOpen(false))}
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
