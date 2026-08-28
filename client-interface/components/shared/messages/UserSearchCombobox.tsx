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
  admin: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  mentor: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
  mentee: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (searchTerm: string, role?: string) => {
    setIsLoading(true);
    try {
      const users = await messagingApi.searchUsers(searchTerm, role);
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search when query or role changes
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchUsers(query, roleFilter);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, roleFilter, open, fetchUsers]);

  // Load initial results when popover opens
  useEffect(() => {
    if (open) {
      fetchUsers('', roleFilter);
    }
  }, [open, fetchUsers, roleFilter]);

  const handleSelect = (user: SearchableUser) => {
    onSelect(user);
    setOpen(false);
    setQuery('');
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
          <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-100 dark:border-slate-800">
            {roleOptions.map((option) => (
              <button
                key={option.label}
                onClick={() => setRoleFilter(option.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  roleFilter === option.value
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <CommandList>
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
                          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold shrink-0">
                            {(user.firstName?.[0] || '').toUpperCase()}
                            {(user.lastName?.[0] || '').toUpperCase()}
                          </div>
                        )}

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {fullName || 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                        </div>

                        {/* Role badge */}
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {user.role}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
