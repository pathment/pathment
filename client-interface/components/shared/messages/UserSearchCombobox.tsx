'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import Image from 'next/image';

import { messagingApi } from '@/lib/services/messaging-api';
import type { SearchableUser } from '@/lib/types/messaging';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  mentor: 'bg-brand-100 text-brand-700',
  mentee: 'bg-emerald-100 text-emerald-700',
};

const DEBOUNCE_MS = 300;

interface UserSearchComboboxProps {
  onSelect: (user: SearchableUser) => void;
}

export default function UserSearchCombobox({ onSelect }: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (searchTerm: string, currentPage: number, role?: string) => {
    if (currentPage === 1) {
      setIsLoading(true);
    } else {
      setIsFetchingNextPage(true);
    }
    try {
      const users = await messagingApi.searchUsers(searchTerm, currentPage, role);
      setResults((prev) => {
        if (currentPage === 1) return users;
        const ids = new Set(prev.map((u) => u.id));
        return [...prev, ...users.filter((u) => !ids.has(u.id))];
      });
      setHasMore(users.length === 25);
    } catch {
      if (currentPage === 1) {
        setResults([]);
      }
    } finally {
      setIsLoading(false);
      setIsFetchingNextPage(false);
    }
  }, []);

  // Reset pagination on query or roleFilter change
  useEffect(() => {
    setPage(1);
    setResults([]);
    setHasMore(true);
  }, [query, roleFilter]);

  // Reset state completely when popover closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setRoleFilter(undefined);
      setPage(1);
      setResults([]);
      setHasMore(true);
    }
  }, [open]);

  // Debounced search for query/role changes (page=1)
  useEffect(() => {
    if (!open) return;
    if (page !== 1) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchUsers(query, 1, roleFilter);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, roleFilter, open, fetchUsers, page]);

  // Load next page when page changes (> 1)
  useEffect(() => {
    if (open && page > 1) {
      fetchUsers(query, page, roleFilter);
    }
  }, [page, open, fetchUsers]);

  const handleSelect = (user: SearchableUser) => {
    onSelect(user);
    setOpen(false);
    setQuery('');
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const tolerance = 20; // px before reaching bottom
    if (
      target.scrollHeight - target.scrollTop <= target.clientHeight + tolerance &&
      hasMore &&
      !isLoading &&
      !isFetchingNextPage
    ) {
      setPage((prev) => prev + 1);
    }
  };

  const roleOptions = [
    { value: undefined, label: 'All' },
    { value: 'mentor', label: 'Mentor' },
    { value: 'mentee', label: 'Mentee' },
    { value: 'admin', label: 'Admin' },
  ] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 h-10 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors">
          <UserPlus className="w-4 h-4" />
          New Chat
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or email..."
            value={query}
            onValueChange={setQuery}
          />

          {/* Role filter tabs */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-100">
            {roleOptions.map((option) => (
              <button
                key={option.label}
                onClick={() => setRoleFilter(option.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  roleFilter === option.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <CommandList onScroll={handleScroll}>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1 text-slate-500">
                    <Search className="w-5 h-5" />
                    <span>No users found</span>
                  </div>
                </CommandEmpty>

                <CommandGroup>
                  {results.map((user) => {
                    const fullName = `${user.firstName} ${user.lastName}`.trim();

                    return (
                      <CommandItem
                        key={user.id}
                        value={user.id}
                        onSelect={() => handleSelect(user)}
                        className="flex items-center gap-3 px-2 py-2.5 cursor-pointer"
                      >
                        {/* Avatar */}
                        {user.profilePictureUrl ? (
                          <Image
                            src={user.profilePictureUrl}
                            alt={fullName}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
                            {(user.firstName?.[0] || '').toUpperCase()}
                            {(user.lastName?.[0] || '').toUpperCase()}
                          </div>
                        )}

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {fullName || 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        </div>

                        {/* Role badge */}
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {user.role}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>

                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-4 border-t border-slate-50">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
