import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskStore } from './taskStore';
import * as db from '@/utils/db';
import * as syncEngineModule from '@/utils/syncEngine';
import * as syncSocketModule from '@/utils/syncSocket';
import { Task } from '@/types';

global.fetch = vi.fn();

vi.mock('@/utils/syncSocket', () => ({
  connectWebSocket: vi.fn(),
}));

describe('taskStore.ts', () => {
  let taskStore: TaskStore;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(db, 'getTasks').mockResolvedValue([]);
    vi.spyOn(db, 'saveTask').mockResolvedValue(undefined);
    vi.spyOn(db, 'queueTaskForSync').mockResolvedValue(undefined);
    vi.spyOn(db, 'deleteTask').mockResolvedValue(undefined);
    vi.spyOn(syncEngineModule.syncEngine, 'notifyDirty').mockImplementation(() => {});
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with loading state', () => {
      taskStore = new TaskStore();
      expect(taskStore.loading).toBe(true);
    });

    it('should connect to WebSocket', () => {
      taskStore = new TaskStore();
      expect(syncSocketModule.connectWebSocket).toHaveBeenCalled();
    });

    it('should load tasks from IndexedDB', async () => {
      const persistedTasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Persisted Task',
          completed: false,
          updatedAt: Date.now(),
        },
      ];

      vi.spyOn(db, 'getTasks').mockResolvedValue(persistedTasks);

      taskStore = new TaskStore();

      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });

      expect(taskStore.tasks.size).toBe(1);
      expect(taskStore.tasks.get(persistedTasks[0].id)).toEqual(persistedTasks[0]);
    });

    it('should bootstrap from server', async () => {
      const serverTasks: Task[] = [
        {
          id: crypto.randomUUID(),
          title: 'Server Task',
          completed: true,
          updatedAt: Date.now(),
        },
      ];

      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => serverTasks,
      });

      taskStore = new TaskStore();

      await vi.waitFor(() => {
        expect(taskStore.tasks.has(serverTasks[0].id)).toBe(true);
      });
    });

    it('should handle server bootstrap error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (fetch as any).mockRejectedValue(new Error('Network error'));

      taskStore = new TaskStore();

      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to pull from server', expect.any(Error));
    });

    it('should remove local tasks not present on server', async () => {
      const localTask: Task = {
        id: crypto.randomUUID(),
        title: 'Local Only',
        completed: false,
        updatedAt: Date.now(),
      };

      const serverTask: Task = {
        id: crypto.randomUUID(),
        title: 'Server Task',
        completed: false,
        updatedAt: Date.now(),
      };

      vi.spyOn(db, 'getTasks').mockResolvedValue([localTask]);
      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [serverTask],
      });

      taskStore = new TaskStore();

      await vi.waitFor(() => {
        expect(taskStore.tasks.has(serverTask.id)).toBe(true);
      });

      expect(taskStore.tasks.has(localTask.id)).toBe(false);
      expect(taskStore.tasks.has(serverTask.id)).toBe(true);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      taskStore = new TaskStore();
      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });
    });

    it('should create new task', async () => {
      const taskData = {
        id: crypto.randomUUID(),
        title: 'New Task',
      };

      const task = await taskStore.save(taskData);

      expect(task.id).toBe(taskData.id);
      expect(task.title).toBe('New Task');
      expect(task.completed).toBe(false);
      expect(task.updatedAt).toBeGreaterThan(0);
      expect(taskStore.tasks.has(task.id)).toBe(true);
    });

    it('should update existing task', async () => {
      const taskData = {
        id: crypto.randomUUID(),
        title: 'Original Title',
      };

      const originalTask = await taskStore.save(taskData);

      const updatedData = {
        id: originalTask.id,
        title: 'Updated Title',
        completed: true,
      };

      const updatedTask = await taskStore.save(updatedData);

      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.completed).toBe(true);
      expect(updatedTask.updatedAt).toBeGreaterThan(originalTask.updatedAt);
    });

    it('should call saveTask with task data', async () => {
      const saveTaskSpy = vi.spyOn(db, 'saveTask');

      const taskData = {
        id: crypto.randomUUID(),
        title: 'Test',
      };

      await taskStore.save(taskData);

      expect(saveTaskSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: taskData.id,
        title: 'Test',
      }));
    });

    it('should queue task for sync', async () => {
      const queueSpy = vi.spyOn(db, 'queueTaskForSync');

      const taskData = {
        id: crypto.randomUUID(),
        title: 'Test',
      };

      await taskStore.save(taskData);

      expect(queueSpy).toHaveBeenCalled();
    });

    it('should notify sync engine', async () => {
      const notifySpy = vi.spyOn(syncEngineModule.syncEngine, 'notifyDirty');

      const taskData = {
        id: crypto.randomUUID(),
        title: 'Test',
      };

      await taskStore.save(taskData);

      expect(notifySpy).toHaveBeenCalled();
    });

    it('should handle partial task data', async () => {
      const taskData = {
        id: crypto.randomUUID(),
      };

      const task = await taskStore.save(taskData);

      expect(task.title).toBe('');
      expect(task.completed).toBe(false);
    });

    it('should preserve existing fields not in update', async () => {
      const originalTask = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Original',
        completed: true,
      });

      const updatedTask = await taskStore.save({
        id: originalTask.id,
        title: 'Updated',
      });

      expect(updatedTask.completed).toBe(true);
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      taskStore = new TaskStore();
      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });
    });

    it('should delete task from store', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'To Delete',
      });

      expect(taskStore.tasks.has(task.id)).toBe(true);

      await taskStore.delete(task.id);

      expect(taskStore.tasks.has(task.id)).toBe(false);
    });

    it('should create tombstone with deleted flag', async () => {
      const saveTaskSpy = vi.spyOn(db, 'saveTask');

      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'To Delete',
      });

      await taskStore.delete(task.id);

      expect(saveTaskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: task.id,
          deleted: true,
        })
      );
    });

    it('should queue tombstone for sync', async () => {
      const queueSpy = vi.spyOn(db, 'queueTaskForSync');

      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'To Delete',
      });

      await taskStore.delete(task.id);

      expect(queueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted: true,
        })
      );
    });

    it('should notify sync engine', async () => {
      const notifySpy = vi.spyOn(syncEngineModule.syncEngine, 'notifyDirty');

      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'To Delete',
      });

      await taskStore.delete(task.id);

      expect(notifySpy).toHaveBeenCalled();
    });

    it('should do nothing if task does not exist', async () => {
      const saveTaskSpy = vi.spyOn(db, 'saveTask');

      await taskStore.delete('non-existent-id');

      expect(saveTaskSpy).not.toHaveBeenCalled();
    });

    it('should update updatedAt timestamp', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'To Delete',
      });

      const originalUpdatedAt = task.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));
      await taskStore.delete(task.id);

      const saveTaskSpy = vi.spyOn(db, 'saveTask');
      const lastCall = saveTaskSpy.mock.calls[saveTaskSpy.mock.calls.length - 1];
      if (lastCall) {
        expect((lastCall[0] as Task).updatedAt).toBeGreaterThan(originalUpdatedAt);
      }
    });
  });

  describe('applyRemote', () => {
    beforeEach(async () => {
      taskStore = new TaskStore();
      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });
    });

    it('should apply remote task if it does not exist locally', () => {
      const remoteTask: Task = {
        id: crypto.randomUUID(),
        title: 'Remote Task',
        completed: false,
        updatedAt: Date.now(),
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.has(remoteTask.id)).toBe(true);
      expect(taskStore.tasks.get(remoteTask.id)).toEqual(remoteTask);
    });

    it('should apply remote task if it is newer', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Local Task',
      });

      const remoteTask: Task = {
        ...task,
        title: 'Updated Remote',
        updatedAt: task.updatedAt + 1000,
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.get(task.id)?.title).toBe('Updated Remote');
    });

    it('should not apply remote task if local is newer', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Local Task',
      });

      const remoteTask: Task = {
        ...task,
        title: 'Outdated Remote',
        updatedAt: task.updatedAt - 1000,
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.get(task.id)?.title).toBe('Local Task');
    });

    it('should delete task if remote has deleted flag', () => {
      const deleteTaskSpy = vi.spyOn(db, 'deleteTask');

      const remoteTask: Task = {
        id: crypto.randomUUID(),
        title: 'Deleted Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: true,
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.has(remoteTask.id)).toBe(false);
      expect(deleteTaskSpy).toHaveBeenCalledWith(remoteTask.id);
    });

    it('should save remote task to IndexedDB', () => {
      const saveTaskSpy = vi.spyOn(db, 'saveTask');

      const remoteTask: Task = {
        id: crypto.randomUUID(),
        title: 'Remote Task',
        completed: false,
        updatedAt: Date.now(),
      };

      taskStore.applyRemote(remoteTask);

      expect(saveTaskSpy).toHaveBeenCalledWith(remoteTask);
    });

    it('should handle remote task with same timestamp', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Local Task',
      });

      const remoteTask: Task = {
        ...task,
        title: 'Remote Task Same Time',
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.get(task.id)?.title).toBe('Local Task');
    });
  });

  describe('sortedTasks', () => {
    beforeEach(async () => {
      taskStore = new TaskStore();
      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });
    });

    it('should return empty array when no tasks', () => {
      expect(taskStore.sortedTasks).toEqual([]);
    });

    it('should return tasks sorted by updatedAt descending', async () => {
      const task1 = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Task 1',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const task2 = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Task 2',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const task3 = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Task 3',
      });

      const sorted = taskStore.sortedTasks;

      expect(sorted).toHaveLength(3);
      expect(sorted[0].id).toBe(task3.id);
      expect(sorted[1].id).toBe(task2.id);
      expect(sorted[2].id).toBe(task1.id);
    });

    it('should update when tasks are modified', async () => {
      const task1 = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Task 1',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const task2 = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Task 2',
      });

      let sorted = taskStore.sortedTasks;
      expect(sorted[0].id).toBe(task2.id);

      await new Promise(resolve => setTimeout(resolve, 10));

      await taskStore.save({
        id: task1.id,
        title: 'Updated Task 1',
      });

      sorted = taskStore.sortedTasks;
      expect(sorted[0].id).toBe(task1.id);
    });
  });

  describe('Integration tests', () => {
    beforeEach(async () => {
      taskStore = new TaskStore();
      await vi.waitFor(() => {
        expect(taskStore.loading).toBe(false);
      });
    });

    it('should handle complete task lifecycle', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Lifecycle Task',
      });

      expect(taskStore.tasks.has(task.id)).toBe(true);
      expect(task.completed).toBe(false);

      const updatedTask = await taskStore.save({
        id: task.id,
        completed: true,
      });

      expect(updatedTask.completed).toBe(true);

      await taskStore.delete(task.id);

      expect(taskStore.tasks.has(task.id)).toBe(false);
    });

    it('should handle remote updates during local operations', async () => {
      const localTask = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Local Task',
      });

      const remoteTask: Task = {
        id: crypto.randomUUID(),
        title: 'Remote Task',
        completed: true,
        updatedAt: Date.now(),
      };

      taskStore.applyRemote(remoteTask);

      expect(taskStore.tasks.size).toBe(2);
      expect(taskStore.tasks.has(localTask.id)).toBe(true);
      expect(taskStore.tasks.has(remoteTask.id)).toBe(true);
    });

    it('should resolve conflicts with last-write-wins', async () => {
      const task = await taskStore.save({
        id: crypto.randomUUID(),
        title: 'Original',
        completed: false,
      });

      const olderRemote: Task = {
        ...task,
        title: 'Older Remote',
        updatedAt: task.updatedAt - 1000,
      };

      taskStore.applyRemote(olderRemote);
      expect(taskStore.tasks.get(task.id)?.title).toBe('Original');

      const newerRemote: Task = {
        ...task,
        title: 'Newer Remote',
        updatedAt: task.updatedAt + 1000,
      };

      taskStore.applyRemote(newerRemote);
      expect(taskStore.tasks.get(task.id)?.title).toBe('Newer Remote');
    });

    it('should handle multiple rapid operations', async () => {
      const tasks = await Promise.all([
        taskStore.save({ id: crypto.randomUUID(), title: 'Task 1' }),
        taskStore.save({ id: crypto.randomUUID(), title: 'Task 2' }),
        taskStore.save({ id: crypto.randomUUID(), title: 'Task 3' }),
      ]);

      expect(taskStore.tasks.size).toBe(3);

      await Promise.all([
        taskStore.save({ id: tasks[0].id, completed: true }),
        taskStore.save({ id: tasks[1].id, title: 'Updated Task 2' }),
        taskStore.delete(tasks[2].id),
      ]);

      expect(taskStore.tasks.size).toBe(2);
      expect(taskStore.tasks.get(tasks[0].id)?.completed).toBe(true);
      expect(taskStore.tasks.get(tasks[1].id)?.title).toBe('Updated Task 2');
      expect(taskStore.tasks.has(tasks[2].id)).toBe(false);
    });
  });
});
