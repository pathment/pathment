# React Query Architecture Guide

## Table of Contents

1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Project Structure](#project-structure)
4. [Query Factories Pattern](#query-factories-pattern)
5. [Implementation Examples](#implementation-examples)
6. [Best Practices](#best-practices)
7. [Migration Strategy](#migration-strategy)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting](#troubleshooting)

## Overview

This architecture is based on the **Query Factories** pattern recommended by the TkDODO (maintainer of react query), which keeps `queryKey` and `queryFn` together while providing type safety and reusability.

### Why Query Factories?

- **Maintains inseparable relationship** between `queryKey` and `queryFn`
- **Reduces abstraction layers** that could make code harder to follow
- **Provides type safety** with TypeScript
- **Enables reusability** across different contexts (hooks, prefetching, SSR)
- **Supports composition** for hierarchical key structures

## Core Principles

### 1. **QueryKey + QueryFn Together**

Always keep query keys and query functions in the same place.They are an inseparable pair since the queryKey defines the dependencies needed inside the queryFn. 

### 2. **Entity-Based Organization**

Create one query factory per **entity/domain** (mirroring `lib/services/<entity>-api.ts`), with all queryKeys starting with the same prefix. Group factories by entity, **not** by role — the same entity is read by admin/mentor/mentee and should share a single cache namespace.

### 3. **Hierarchical Key Structure**

Use arrays with consistent structure for easy invalidation and composition.

### 4. **Type Safety First**

Use `queryOptions` for better TypeScript inference and autocomplete.

### 5. **Global Configuration**

Set sensible defaults in QueryClient while allowing per-query customization.

## Project Structure

This guide is adapted to Pathment's existing **layer-then-role** layout in `client-interface/`, not a generic `src/features/` tree. Most pieces already exist — the only genuinely new layer is the **Query Factories** in `lib/queries/`.

```
client-interface/
├── lib/
│   ├── context/
│   │   └── QueryProvider.tsx     # QueryClientProvider + client config — DONE
│   ├── config/
│   │   └── api.ts                # apiConfig: base URL + endpoints (existing)
│   ├── services/                 # axios API functions, one file per entity (existing, ~38)
│   │   ├── roadmap-api.ts
│   │   ├── mentee-api.ts
│   │   └── ...
│   ├── queries/                  # NEW — Query Factories, one file per entity
│   │   ├── roadmap.ts            #   roadmapQueries  (pairs with roadmap-api.ts)
│   │   ├── mentee.ts
│   │   └── ...
│   ├── hooks/                    # custom hooks, grouped by ROLE (existing, ~64)
│   │   ├── admin/                #   e.g. useDashboard, useMentorsList
│   │   ├── mentor/
│   │   ├── mentee/               #   e.g. useMyRoadmaps → useQuery(roadmapQueries…)
│   │   ├── shared/
│   │   └── community/
│   └── types/                    # shared TS types (existing)
└── app/                          # Next.js App Router; layout.tsx mounts QueryProvider — DONE
```

**Two axes to keep straight:**

- **Services & query factories are grouped by _entity_** (`roadmap`, `mentee`, `program`…) — one cache namespace per entity.
- **Hooks are grouped by _role_** (`admin/`, `mentor/`, `mentee/`) — a role hook imports the entity factory and calls `useQuery(...)`.

> **Reading the examples below:** the generic `todos` examples illustrate the pattern. In this repo, read `todos` as a real entity — e.g. `roadmap`:
> - `features/todos/api/todos.ts` → `lib/services/roadmap-api.ts` (already exists)
> - `features/todos/queries.ts` → `lib/queries/roadmap.ts` (new)
> - `features/todos/hooks/use-todos.ts` → `lib/hooks/<role>/useMyRoadmaps.ts` (already exists)

## Query Factories Pattern

### Basic Structure

```typescript
// features/todos/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { fetchTodos, fetchTodo, fetchTodosByUser } from "./api/todos";

export const todoQueries = {
  // Key-only factories for invalidation
  all: () => ["todos"] as const,
  allLists: () => [...todoQueries.all(), "list"] as const,
  allDetails: () => [...todoQueries.all(), "detail"] as const,
  allByUser: (userId: number) =>
    [...todoQueries.all(), "user", userId] as const,

  // Complete query factories with queryOptions
  list: (sort?: string) =>
    queryOptions({
      queryKey: [...todoQueries.allLists(), { sort }] as const,
      queryFn: () => fetchTodos(sort),
      staleTime: 5 * 60 * 1000,
    }),

  detail: (id: number) =>
    queryOptions({
      queryKey: [...todoQueries.allDetails(), id] as const,
      queryFn: () => fetchTodo(id),
      staleTime: 5 * 60 * 1000,
      enabled: !!id,
    }),

  byUser: (userId: number, sort?: string) =>
    queryOptions({
      queryKey: [...todoQueries.allByUser(userId), { sort }] as const,
      queryFn: () => fetchTodosByUser(userId, sort),
      staleTime: 5 * 60 * 1000,
      enabled: !!userId,
    }),
} as const;
```

### Key-Only vs Complete Factories

**Key-Only Factories** (for invalidation):

```typescript
all: () => ['todos'] as const,
allLists: () => [...todoQueries.all(), 'list'] as const,
```

**Complete Factories** (for useQuery):

```typescript
list: (sort?: string) => queryOptions({
  queryKey: [...todoQueries.allLists(), { sort }] as const,
  queryFn: () => fetchTodos(sort),
  staleTime: 5 * 60 * 1000,
}),
```

## Implementation Examples

### 1. QueryClient Setup — already configured ✅

The `QueryClient` and its global defaults already live in [`lib/context/QueryProvider.tsx`](../client-interface/lib/context/QueryProvider.tsx) (`makeQueryClient()`), mounted at the app root in `app/layout.tsx`. **Do not** add a separate `lib/query-client.ts` — tune the defaults (`staleTime`, `gcTime`, `retry`) in the existing provider, and put per-query overrides in the factories.

**Centralize error handling here, not in every hook**, reusing the app's existing `sonner` + `extractApiErrorMessage`. The split matters so toasts don't double up with pages' own error states:

- **Mutations** rarely have an inline error region → **always toast**.
- **Queries** → toast **only when cached data is already on screen** (a background refetch failed, otherwise silent). First-load errors (`data === undefined`) are owned by the page's inline error state / ErrorBoundary via `throwOnError`, so toasting them too would double-report.

```typescript
// inside makeQueryClient() in lib/context/QueryProvider.tsx
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractApiErrorMessage } from "@/lib/utils/api-error";

new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only background-refetch failures (data already on screen); first-load
      // errors are handled by the page / ErrorBoundary.
      if (query.state.data !== undefined) toast.error(extractApiErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => toast.error(extractApiErrorMessage(error)),
  }),
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      // First-load errors (no cached data) bubble to an ErrorBoundary; when cached
      // data exists, keep showing it and rely on the query toast above instead.
      throwOnError: (_error, query) => typeof query.state.data === "undefined",
    },
  },
});
```

### 2. Custom Hooks

**Yes — keep custom hooks.** They're the consumption seam: components import hooks, never `useQuery` directly. A hook is just `useQuery(entityQueries.x())`, and during migration each existing hook keeps its **public return shape** while its internals switch to React Query — so components don't change. Factories hold the query (key + fn); hooks are where components plug in.

```typescript
// lib/hooks/<role>/use-todos.ts  (role-grouped hook consuming an entity factory)
import { useQuery } from "@tanstack/react-query";
import { todoQueries } from "@/lib/queries/todos";

// Hooks take a SINGLE OBJECT argument — order-independent and type-safe.
export function useTodos({ sort }: { sort?: string } = {}) {
  return useQuery(todoQueries.list(sort));
}

export function useTodo({ id }: { id: number }) {
  return useQuery(todoQueries.detail(id));
}

export function useTodosByUser({ userId, sort }: { userId: number; sort?: string }) {
  return useQuery(todoQueries.byUser(userId, sort));
}

// Composing extra options on top of a factory
export function useTodosWithPolling({ sort }: { sort?: string } = {}) {
  return useQuery({
    ...todoQueries.list(sort),
    refetchInterval: 10 * 1000,
  });
}
```

### 3. Mutations

```typescript
// features/todos/hooks/use-todo-mutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { todoQueries } from "../queries";
import { createTodo, updateTodo, deleteTodo } from "../api/todos";

export function useCreateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      // Invalidate using key-only factories
      queryClient.invalidateQueries({
        queryKey: todoQueries.allLists(),
      });
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTodo,
    onSuccess: (data) => {
      // Invalidate lists
      queryClient.invalidateQueries({
        queryKey: todoQueries.allLists(),
      });
      // Update specific item in cache
      queryClient.setQueryData(todoQueries.detail(data.id).queryKey, data);
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTodo,
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: todoQueries.detail(deletedId).queryKey,
      });
      // Invalidate lists
      queryClient.invalidateQueries({
        queryKey: todoQueries.allLists(),
      });
    },
  });
}
```

### 4. Error Handling

```typescript
// components/error-boundary.tsx
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div role="alert">
      <h2>Something went wrong:</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>{children}</ErrorBoundary>
  );
}
```

### 5. Component Usage

```typescript
// components/TodoList.tsx
import { useQueryClient } from "@tanstack/react-query";
import { useTodos } from "@/lib/hooks/<role>/use-todos";
import { useCreateTodo } from "@/lib/hooks/<role>/use-todo-mutations";
import { todoQueries } from "@/lib/queries/todos";

export function TodoList({ sort }: { sort?: string }) {
  const { data: todos, isPending, error } = useTodos({ sort });
  const { mutate: createTodo, isPending: isCreating } = useCreateTodo();
  const queryClient = useQueryClient();

  // Prefetch on hover — no dedicated hook needed; useQueryClient gives you the
  // client anywhere, so just call prefetchQuery with the factory inline.
  const prefetchTodo = (id: number) =>
    queryClient.prefetchQuery(todoQueries.detail(id));

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {todos?.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onHover={() => prefetchTodo(todo.id)} />
      ))}
      <button onClick={() => createTodo({ title: "New Todo" })} disabled={isCreating}>
        {isCreating ? "Creating..." : "Add Todo"}
      </button>
    </div>
  );
}
```

## Best Practices

### 1. **Naming Conventions**

- **Query Factories**: `featureQueries` (e.g., `todoQueries`, `userQueries`)
- **Key-only factories**: Use descriptive names like `all`, `allLists`, `allDetails`
- **Complete factories**: Use action names like `list`, `detail`, `byUser`
- **Custom hooks**: Prefix with `use` (e.g., `useTodos`, `useCreateTodo`)
- **Hook arguments**: pass a **single object** (`useTodo({ id })`), never positional params — type-safe and order-independent

### 2. **Key Structure**

```typescript
// Good: Hierarchical and consistent
["todos", "list", { sort: "asc" }][("todos", "detail", 123)][
  ("todos", "user", 456, "list", { sort: "desc" })
][
  // Bad: Inconsistent structure
  ("todos", "list", "asc")
][("todo", "detail", 123)]; // Missing object wrapper // Inconsistent singular/plural
```

### 3. **TypeScript Usage**

```typescript
// Always use const assertions for better type inference
all: () => ['todos'] as const,
list: (sort?: string) => queryOptions({
  queryKey: [...todoQueries.allLists(), { sort }] as const,
  // ... rest of options
}),
```

### 4. **Error Handling → configured in the QueryClient**

Global error handling is set up **once** in the QueryClient — see [Implementation Examples §1](#1-queryclient-setup--already-configured-): mutations always toast; query failures toast only when cached data is already on screen (first-load errors go to the page / ErrorBoundary). Don't add per-hook error toasts — use a local `error` only when a component needs bespoke inline UI.



## Migration Strategy

### Phase 1: Setup — DONE ✅

1. ~~Install React Query and dependencies~~ — `@tanstack/react-query` v5 (+ devtools) installed
2. ~~Create QueryClient configuration~~ — in `lib/context/QueryProvider.tsx` (incl. global error handling)
3. ~~Set up provider~~ — mounted in `app/layout.tsx`

### Phase 2: Create Query Factories

1. Add `lib/queries/<entity>.ts` per entity, pairing with the existing `lib/services/<entity>-api.ts`
2. Start with the most commonly used entities (e.g. roadmap, programs, dashboard)
3. Keep keys hierarchical and entity-prefixed for easy invalidation

### Phase 3: Convert Hooks (one role-area at a time)

1. Rewrite each `lib/hooks/<role>/useX.ts` internally to `useQuery(entityQueries…)` / `useMutation`
2. **Preserve each hook's public return shape** so consuming components don't change
3. Migrate by area (e.g. mentee → mentor → admin) and test each before moving on

## Common Patterns

### 1. **Dependent Queries**

```typescript
// User must be loaded before loading user's todos
export function useUserTodos(userId: number) {
  const { data: user } = useUser(userId);

  return useQuery({
    ...todoQueries.byUser(userId),
    enabled: !!user, // Only run when user is loaded
  });
}
```

### 2. **Parallel Queries**

```typescript
// The three observers mount together and fetch in PARALLEL automatically —
// useQuery doesn't block, so there's no request waterfall.
export function useDashboardData() {
  const todosQuery = useQuery(todoQueries.list());
  const usersQuery = useQuery(userQueries.list());
  const postsQuery = useQuery(postQueries.list());

  return {
    todos: todosQuery.data,
    users: usersQuery.data,
    posts: postsQuery.data,
    isPending:
      todosQuery.isPending || usersQuery.isPending || postsQuery.isPending,
  };
}
```

> For a **dynamic** number of parallel queries (you can't call hooks in a loop), use `useQueries` instead of a fixed set of `useQuery` calls.

### 3. **Infinite Queries**

```typescript
// features/posts/queries.ts
export const postQueries = {
  infiniteList: (filters: PostFilters) =>
    queryOptions({
      queryKey: [...postQueries.allLists(), "infinite", filters] as const,
      queryFn: ({ pageParam = 0 }) =>
        fetchPosts({ ...filters, page: pageParam }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
    }),
};

// features/posts/hooks/use-posts.ts
export function useInfinitePosts(filters: PostFilters) {
  return useInfiniteQuery(postQueries.infiniteList(filters));
}
```

### 4. **Pagination Patterns**

#### A. **Traditional Pagination (External State)**

```typescript
// features/posts/queries.ts
export const postQueries = {
  all: () => ["posts"] as const,
  allLists: () => [...postQueries.all(), "list"] as const,
  
  // Paginated query factory
  list: (filters: PostFilters, page: number = 1) =>
    queryOptions({
      queryKey: [...postQueries.allLists(), { ...filters, page }] as const,
      queryFn: () => fetchPosts({ ...filters, page }),
      staleTime: 5 * 60 * 1000,
      // Keep previous data for smooth pagination
      placeholderData: (previousData) => previousData,
    }),
};

// features/posts/hooks/use-posts.ts
export function usePosts(filters: PostFilters, page: number = 1) {
  return useQuery(postQueries.list(filters, page));
}

// Component implementation
export function PostList({ filters }: { filters: PostFilters }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isPlaceholderData } = usePosts(filters, page);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  if (isLoading && !data) return <div>Loading...</div>;

  return (
    <div>
      <ul style={{ opacity: isPlaceholderData ? 0.5 : 1 }}>
        {data?.posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      
      <div>
        <button
          onClick={() => setPage(p => p - 1)}
          disabled={page === 1 || isPlaceholderData}
        >
          Previous
        </button>
        
        <span>Page {page} of {data?.totalPages}</span>
        
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={page >= (data?.totalPages || 1) || isPlaceholderData}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

#### B. **Infinite Queries**

```typescript
// features/posts/queries.ts
export const postQueries = {
  all: () => ["posts"] as const,
  allLists: () => [...postQueries.all(), "list"] as const,
  
  // Infinite query factory
  infiniteList: (filters: PostFilters) =>
    queryOptions({
      queryKey: [...postQueries.allLists(), "infinite", filters] as const,
      queryFn: ({ pageParam = 1 }) => fetchPosts({ ...filters, page: pageParam }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      getPreviousPageParam: (firstPage) => firstPage.prevPage,
      initialPageParam: 1,
      staleTime: 5 * 60 * 1000,
    }),
};

// features/posts/hooks/use-posts.ts
export function useInfinitePosts(filters: PostFilters) {
  return useInfiniteQuery(postQueries.infiniteList(filters));
}

// Component implementation
export function InfinitePostList({ filters }: { filters: PostFilters }) {
  const {
    data,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
  } = useInfinitePosts(filters);

  const posts = data?.pages.flatMap(page => page.posts) ?? [];

  return (
    <div>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      
      <div>
        <button
          onClick={() => fetchPreviousPage()}
          disabled={!hasPreviousPage || isFetchingPreviousPage}
        >
          {isFetchingPreviousPage ? "Loading..." : "Previous"}
        </button>
        
        <button
          onClick={() => fetchNextPage()}
          disabled={!hasNextPage || isFetchingNextPage}
        >
          {isFetchingNextPage ? "Loading..." : "Next"}
        </button>
      </div>
    </div>
  );
}
```

**When to Use Each Pattern:**
- **Traditional Pagination**: When you need discrete page navigation with page numbers
- **Infinite Queries**: When you want seamless infinite scrolling or "Load More" functionality

### 5. **Optimistic Updates**

```typescript
export function useUpdateTodoOptimistic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTodo,
    onMutate: async (newTodo) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: todoQueries.detail(newTodo.id).queryKey,
      });

      // Snapshot previous value
      const previousTodo = queryClient.getQueryData(
        todoQueries.detail(newTodo.id).queryKey
      );

      // Optimistically update
      queryClient.setQueryData(
        todoQueries.detail(newTodo.id).queryKey,
        newTodo
      );

      return { previousTodo };
    },
    onError: (err, newTodo, context) => {
      // Rollback on error
      queryClient.setQueryData(
        todoQueries.detail(newTodo.id).queryKey,
        context?.previousTodo
      );
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({
        queryKey: todoQueries.detail(variables.id).queryKey,
      });
    },
  });
}
```

> **Why this works (re: subscribers):** every component subscribed to that query key reads the **same** cache entry, so `setQueryData` re-renders **all** of them instantly with the optimistic value. `cancelQueries` stops an in-flight refetch from clobbering it, and the `onSettled` invalidation re-syncs every subscriber with server truth.

## Troubleshooting

### Common Issues

1. **TypeScript Errors with queryOptions**

   ```typescript
   // Make sure to import queryOptions
   import { queryOptions } from '@tanstack/react-query'

   // Use const assertions
   queryKey: [...todoQueries.allLists(), { sort }] as const,
   ```

2. **Incorrect Invalidation**

   ```typescript
   // Wrong: Passing array directly
   queryClient.invalidateQueries(todoQueries.allLists());

   // Correct: Wrapping in object
   queryClient.invalidateQueries({
     queryKey: todoQueries.allLists(),
   });
   ```

3. **Missing Dependencies in QueryKey**

   ```typescript
   // Make sure all variables used in queryFn are in queryKey
   list: (sort?: string) => queryOptions({
     queryKey: [...todoQueries.allLists(), { sort }] as const, // ✅ sort included
     queryFn: () => fetchTodos(sort), // ✅ sort used in queryFn
   }),
   ```

### Performance Tips

1. **Use appropriate staleTime** based on data freshness requirements
2. **Implement proper garbage collection** with gcTime
3. **Use select option** for data transformation to prevent unnecessary re-renders
4. **Implement proper prefetching** for better UX
5. **Use React.memo** for components that receive query data

### Debugging

1. **Enable React Query DevTools** in development
2. **Use consistent queryKey structure** for easier debugging
3. **Add logging** to query functions for debugging
4. **Monitor network requests** in browser dev tools
5. **Use queryClient.getQueryData()** to inspect cache state

---

## Conclusion

This architecture provides a scalable, maintainable approach to React Query integration that follows the official course recommendations. The Query Factories pattern ensures that query keys and functions stay together while providing excellent TypeScript support and reusability across your application.

Remember to:

- Keep queryKey and queryFn together
- Use feature-based organization
- Implement proper error handling
- Follow TypeScript best practices
- Test thoroughly during migration

For more advanced patterns and edge cases, refer to the official React Query documentation and the course materials.
