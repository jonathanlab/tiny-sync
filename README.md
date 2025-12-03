# tiny-sync

A minimal offline-first sync engine demonstrating real-time data synchronization between a React client and Node.js server.

See also: [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)

## Overview

tiny-sync is a reference implementation for building offline-capable applications with real-time sync. It uses a simple task management app to demonstrate:

- **Offline-first architecture**: Changes are persisted locally first, then synced when online
- **Real-time updates**: WebSocket-based broadcasting for instant cross-client updates
- **Last-write-wins conflict resolution**: Simple timestamp-based conflict handling
- **Soft deletes with tombstones**: Deleted items are marked rather than removed for proper sync

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  TaskStore  │───▶│  IndexedDB  │    │     SyncEngine      │ │
│  │   (MobX)    │    │  (tasks +   │◀──▶│ (debounced queue    │ │
│  └─────────────┘    │ sync queue) │    │  flush to server)   │ │
│                     └─────────────┘    └─────────────────────┘ │
│                                                  │              │
│  ┌─────────────────────────────────────────────┐│              │
│  │              SyncSocket                     ││              │
│  │  (WebSocket for real-time remote updates)  │◀┘              │
│  └─────────────────────────────────────────────┘               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                     HTTP POST /api/sync
                     WebSocket /sync
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                          Server                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Express   │───▶│   SQLite    │    │   WebSocketServer   │ │
│  │  REST API   │    │ (better-    │    │  (broadcast tasks   │ │
│  └─────────────┘    │  sqlite3)   │    │   to all clients)   │ │
│                     └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

**Client:**
- React 19 + TypeScript
- MobX for state management
- IndexedDB for local persistence
- Vite for bundling

**Server:**
- Express 5
- better-sqlite3 for persistence
- WebSocket (ws) for real-time communication
- Zod for schema validation

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running the Application

```bash
# Terminal 1: Start the server
cd server
npm run dev

# Terminal 2: Start the client
cd client
npm run dev
```

The client will be available at `http://localhost:5173` and the server at `http://localhost:3000`.

## How It Works

### Sync Flow

1. **Local Write**: When a task is created/updated/deleted, changes are immediately:
   - Applied to the MobX store (instant UI update)
   - Persisted to IndexedDB
   - Added to the sync queue

2. **Queue Flush**: The SyncEngine debounces writes (100ms) and flushes the queue:
   - POSTs queued changes to `/api/sync`
   - Clears the queue on success
   - Retries automatically on failure (30s interval + online event)

3. **Broadcast**: When the server receives changes:
   - Validates and persists to SQLite
   - Broadcasts to all connected WebSocket clients

4. **Remote Apply**: When a client receives a WebSocket message:
   - Compares timestamps (last-write-wins)
   - Updates local state and IndexedDB if newer

### Conflict Resolution

Uses last-write-wins based on `updatedAt` timestamps. When receiving a remote update:

```typescript
const shouldApply = !existing || task.updatedAt > existing.updatedAt;
```

### Soft Deletes

Deleted tasks are tombstoned (`deleted: true`) rather than removed. This ensures:
- Deletes propagate correctly to all clients
- No resurrection of deleted items during sync

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Fetch all tasks |
| POST | `/api/sync` | Sync task changes |
| WS | `/sync` | WebSocket for real-time updates |

## Project Structure

```
tiny-sync/
├── client/
│   └── src/
│       ├── stores/
│       │   └── taskStore.ts    # MobX store with sync logic
│       ├── utils/
│       │   ├── db.ts           # IndexedDB operations
│       │   ├── syncEngine.ts   # Queue-based sync to server
│       │   └── syncSocket.ts   # WebSocket client
│       └── types.ts            # Shared types
├── server/
│   └── src/
│       ├── index.ts            # Express server + routes
│       ├── db.ts               # SQLite operations
│       ├── schema.ts           # Zod schemas
│       └── websocket.ts        # WebSocket server
└── tsconfig.base.json          # Shared TS config
```

## License

MIT
