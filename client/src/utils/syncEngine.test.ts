import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncEngine } from './syncEngine';
import * as db from './db';
import { Task } from '@/types';

global.fetch = vi.fn();

describe('syncEngine.ts', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.spyOn(db, 'getSyncQueue').mockResolvedValue([]);
    vi.spyOn(db, 'clearSyncQueue').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should set up periodic sync with setInterval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      syncEngine = new SyncEngine();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    });

    it('should listen to online event', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      syncEngine = new SyncEngine();

      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    });
  });

  describe('notifyDirty', () => {
    beforeEach(() => {
      syncEngine = new SyncEngine();
    });

    it('should debounce sync calls', async () => {
      const syncSpy = vi.spyOn(syncEngine, 'sync').mockResolvedValue(true);

      syncEngine.notifyDirty();
      syncEngine.notifyDirty();
      syncEngine.notifyDirty();

      expect(syncSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);

      expect(syncSpy).toHaveBeenCalledTimes(1);
    });

    it('should not start new debounce timer if one is already running', async () => {
      const syncSpy = vi.spyOn(syncEngine, 'sync').mockResolvedValue(true);

      syncEngine.notifyDirty();
      await vi.advanceTimersByTimeAsync(50);
      syncEngine.notifyDirty();
      await vi.advanceTimersByTimeAsync(50);

      expect(syncSpy).not.toHaveBeenCalled();
    });

    it('should call sync after debounce delay', async () => {
      const syncSpy = vi.spyOn(syncEngine, 'sync').mockResolvedValue(true);

      syncEngine.notifyDirty();

      await vi.advanceTimersByTimeAsync(99);
      expect(syncSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      syncEngine = new SyncEngine();
    });

    it('should return false if already syncing', async () => {
      vi.spyOn(db, 'getSyncQueue').mockImplementation(() => new Promise(() => {}));

      const promise1 = syncEngine.sync();
      const result2 = await syncEngine.sync();

      expect(result2).toBe(false);
    });

    it('should return true if queue is empty', async () => {
      vi.spyOn(db, 'getSyncQueue').mockResolvedValue([]);

      const result = await syncEngine.sync();

      expect(result).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should send sync queue to backend', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task 1',
          completed: false,
          updatedAt: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          title: 'Task 2',
          completed: true,
          updatedAt: Date.now() + 1000,
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await syncEngine.sync();

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      });
    });

    it('should clear sync queue after successful sync', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      const clearSpy = vi.spyOn(db, 'clearSyncQueue').mockResolvedValue(undefined);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await syncEngine.sync();

      expect(clearSpy).toHaveBeenCalled();
    });

    it('should return false and not clear queue on HTTP error', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      const clearSpy = vi.spyOn(db, 'clearSyncQueue');
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await syncEngine.sync();

      expect(result).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      const clearSpy = vi.spyOn(db, 'clearSyncQueue');
      (fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await syncEngine.sync();

      expect(result).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('should log sync attempts', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await syncEngine.sync();

      expect(consoleLogSpy).toHaveBeenCalledWith('[syncEngine]: syncing queue', tasks);
    });

    it('should log sync errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Sync failed');

      vi.spyOn(db, 'getSyncQueue').mockRejectedValue(error);

      await syncEngine.sync();

      expect(consoleErrorSpy).toHaveBeenCalledWith('[syncEngine] Sync failed', error);
    });

    it('should reset syncing flag after completion', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await syncEngine.sync();

      const result = await syncEngine.sync();
      expect(result).not.toBe(false);
    });

    it('should reset syncing flag even on error', async () => {
      vi.spyOn(db, 'getSyncQueue').mockRejectedValue(new Error('Error'));

      await syncEngine.sync();

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue([]);
      const result = await syncEngine.sync();
      expect(result).toBe(true);
    });
  });

  describe('Integration tests', () => {
    beforeEach(() => {
      syncEngine = new SyncEngine();
    });

    it('should handle multiple tasks sync lifecycle', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task 1',
          completed: false,
          updatedAt: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          title: 'Task 2',
          completed: true,
          updatedAt: Date.now() + 1000,
        },
        {
          id: crypto.randomUUID(),
          title: 'Task 3',
          completed: false,
          updatedAt: Date.now() + 2000,
          deleted: true,
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      const clearSpy = vi.spyOn(db, 'clearSyncQueue').mockResolvedValue(undefined);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await syncEngine.sync();

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      });
      expect(clearSpy).toHaveBeenCalled();
    });

    it('should trigger sync on window online event', async () => {
      const syncSpy = vi.spyOn(syncEngine, 'sync').mockResolvedValue(true);

      window.dispatchEvent(new Event('online'));

      expect(syncSpy).toHaveBeenCalled();
    });

    it('should trigger sync periodically', async () => {
      const syncSpy = vi.spyOn(syncEngine, 'sync').mockResolvedValue(true);

      await vi.advanceTimersByTimeAsync(30_000);

      expect(syncSpy).toHaveBeenCalled();
    });

    it('should handle debounced notifyDirty followed by immediate sync', async () => {
      const tasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getSyncQueue').mockResolvedValue(tasks);
      (fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      syncEngine.notifyDirty();
      await vi.advanceTimersByTimeAsync(100);

      const result = await syncEngine.sync();

      expect(result).not.toBe(false);
    });
  });
});
