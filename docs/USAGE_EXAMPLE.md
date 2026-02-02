# Using the Unified Action Client

## Quick Start

### 1. In Next.js - Initialize Once (e.g., in `app/layout.tsx`)

```typescript
// app/api-init.ts
import { initServerActions } from "api-client/server";
import { auth } from "@/auth";

// Import existing server actions
import * as workspaceActions from "@/app/stores/WorkspaceDetailStore/actions";
import * as applicationActions from "@/app/(authenticated)/applications/actions";

initServerActions({
  denoApiUrl: process.env.NEXT_PUBLIC_DENO_API_URL || "http://localhost:8000",

  async getAuthToken() {
    const session = await auth();
    return session?.accessToken || null;
  },

  // Wire up existing server actions as fallbacks
  serverActions: {
    workspace: {
      list: workspaceActions.fetchWorkspaces,
      create: workspaceActions.createWorkspace,
      update: workspaceActions.updateWorkspace,
      delete: workspaceActions.deleteWorkspace,
      // ... map other functions
    },
    application: {
      duplicate: applicationActions.duplicateApplication,
      move: applicationActions.moveApplication,
    },
  },
});
```

### 2. Use in Components (No Changes Needed!)

```typescript
// components/WorkspaceList.tsx
import { actions } from "api-client/server";

export async function WorkspaceList() {
  // This transparently calls either Deno API or server action
  const workspaces = await actions.workspace.list();

  return (
    <ul>
      {workspaces.map(ws => (
        <li key={ws.id}>{ws.name}</li>
      ))}
    </ul>
  );
}
```

### 3. Migrate Endpoints Gradually

Edit `shared/api-client/src/config.ts`:

```typescript
export const ENDPOINT_FLAGS: Record<string, boolean> = {
  // Start with read-only endpoints
  "workspace.list": true, // ← Now uses Deno API
  "workspace.get": true, // ← Now uses Deno API
  "workspace.create": false, // Still uses server action
  // ...
};
```

### 4. Client Components

For client components, create a React hook:

```typescript
// hooks/useActions.ts
"use client";

import { useMemo } from "react";
import { createActions } from "api-client";

export function useActions() {
  return useMemo(() =>
    createActions({
      denoApiUrl: process.env.NEXT_PUBLIC_DENO_API_URL!,
      async getAuthToken() {
        // Get token from cookie or session
        return document.cookie
          .split("; ")
          .find(row => row.startsWith("auth-token="))
          ?.split("=")[1] || null;
      },
    }),
    []
  );
}

// Usage in component
function CreateWorkspaceButton() {
  const actions = useActions();

  const handleCreate = async () => {
    const workspace = await actions.workspace.create({
      name: "New Workspace"
    });
    console.log("Created:", workspace);
  };

  return <button onClick={handleCreate}>Create</button>;
}
```

## Migration Checklist

1. **Week 1-2: Foundation**

   - [x] Database schema consolidated
   - [x] Data migration infrastructure
   - [x] Hono API skeleton
   - [x] Auth middleware
   - [x] Unified action client

2. **Week 3-4: Core Read Operations**

   - [ ] Enable `workspace.list` in Deno
   - [ ] Enable `workspace.get` in Deno
   - [ ] Enable `application.list` in Deno
   - [ ] Monitor for issues, rollback if needed

3. **Week 5-6: Core Write Operations**

   - [ ] Enable `workspace.create/update/delete`
   - [ ] Enable `application.create/update/delete`

4. **Week 7+: Everything Else**
   - [ ] Chat streaming
   - [ ] File uploads
   - [ ] Integrations
   - [ ] Voice

## Rollback

If an endpoint has issues, simply flip the flag:

```typescript
ENDPOINT_FLAGS["workspace.list"] = false;
```

Deploy, and traffic routes back to server actions immediately.

## Environment Overrides

```bash
# Force all traffic to Deno (testing)
USE_DENO_API=all npm run dev

# Force all traffic to server actions (emergency)
USE_DENO_API=none npm run dev
```
