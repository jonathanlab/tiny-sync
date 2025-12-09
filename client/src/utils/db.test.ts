import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDB,
  openDB,
  saveTask,
  queueTaskForSync,
  getSyncQueue,
  clearSyncQueue,
  getTasks,
  deleteTask,
  STORE,
} from './db';
import { Task } from '@/types';

describe('db.ts', () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });

  afterEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });

  describe('initDB', () => {
    it('should create database with correct stores', async () => {
      const db = await initDB();

      expect(db.objectStoreNames.contains(STORE.TASKS)).toBe(true);
      expect(db.objectStoreNames.contains(STORE.SYNC_QUEUE)).toBe(true);

      db.close();
    });

    it('should create tasks store with id keyPath', async () => {
      const db = await initDB();

      const transaction = db.transaction(STORE.TASKS, 'readonly');
      const store = transaction.objectStore(STORE.TASKS);

      expect(store.keyPath).toBe('id');

      db.close();
    });

    it('should create syncQueue store with id keyPath', async () => {
      const db = await initDB();

      const transaction = db.transaction(STORE.SYNC_QUEUE, 'readonly');
      const store = transaction.objectStore(STORE.SYNC_QUEUE);

      expect(store.keyPath).toBe('id');

      db.close();
    });

    it('should not recreate stores if they already exist', async () => {
      const db1 = await initDB();
      db1.close();

      const db2 = await initDB();
      expect(db2.objectStoreNames.contains(STORE.TASKS)).toBe(true);
      expect(db2.objectStoreNames.contains(STORE.SYNC_QUEUE)).toBe(true);

      db2.close();
    });
  });

  describe('openDB', () => {
    it('should return a database instance', async () => {
      const db = await openDB();
      expect(db).toBeDefined();
      expect(db.name).toBe('tiny-sync-db');
    });

    it('should reuse the same database promise', async () => {
      const db1 = await openDB();
      const db2 = await openDB();

      expect(db1).toBe(db2);
    });

    it('should initialize database if not already initialized', async () => {
      const db = await openDB();
      expect(db.objectStoreNames.contains(STORE.TASKS)).toBe(true);
    });
  });

  describe('saveTask', () => {
    it('should save a new task', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Test Task',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task);

      const tasks = await getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(task);
    });

    it('should update existing task', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Original Title',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task);

      const updatedTask: Task = {
        ...task,
        title: 'Updated Title',
        completed: true,
        updatedAt: Date.now() + 1000,
      };

      await saveTask(updatedTask);

      const tasks = await getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Updated Title');
      expect(tasks[0].completed).toBe(true);
    });

    it('should handle deleted task', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Deleted Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: true,
      };

      await saveTask(task);

      const tasks = await getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].deleted).toBe(true);
    });
  });

  describe('getTasks', () => {
    it('should return empty array when no tasks exist', async () => {
      await initDB();
      const tasks = await getTasks();
      expect(tasks).toEqual([]);
    });

    it('should return all tasks', async () => {
      const task1: Task = {
        id: crypto.randomUUID(),
        title: 'Task 1',
        completed: false,
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: crypto.randomUUID(),
        title: 'Task 2',
        completed: true,
        updatedAt: Date.now() + 1000,
      };

      await saveTask(task1);
      await saveTask(task2);

      const tasks = await getTasks();
      expect(tasks).toHaveLength(2);
    });

    it('should preserve task properties', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Complex Task',
        completed: true,
        updatedAt: 1234567890,
        deleted: false,
      };

      await saveTask(task);

      const tasks = await getTasks();
      expect(tasks[0]).toEqual(task);
    });
  });

  describe('deleteTask', () => {
    it('should delete a task by id', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Task to Delete',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task);

      let tasks = await getTasks();
      expect(tasks).toHaveLength(1);

      await deleteTask(task.id);

      tasks = await getTasks();
      expect(tasks).toHaveLength(0);
    });

    it('should not throw error when deleting non-existent task', async () => {
      await initDB();
      await expect(deleteTask('non-existent-id')).resolves.not.toThrow();
    });

    it('should only delete the specified task', async () => {
      const task1: Task = {
        id: crypto.randomUUID(),
        title: 'Task 1',
        completed: false,
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: crypto.randomUUID(),
        title: 'Task 2',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task1);
      await saveTask(task2);

      await deleteTask(task1.id);

      const tasks = await getTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task2.id);
    });
  });

  describe('queueTaskForSync', () => {
    it('should add task to sync queue', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Queued Task',
        completed: false,
        updatedAt: Date.now(),
      };

      await queueTaskForSync(task);

      const queue = await getSyncQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toEqual(task);
    });

    it('should update existing task in queue', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Original',
        completed: false,
        updatedAt: Date.now(),
      };

      await queueTaskForSync(task);

      const updatedTask: Task = {
        ...task,
        title: 'Updated',
        updatedAt: Date.now() + 1000,
      };

      await queueTaskForSync(updatedTask);

      const queue = await getSyncQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].title).toBe('Updated');
    });

    it('should handle multiple different tasks in queue', async () => {
      const task1: Task = {
        id: crypto.randomUUID(),
        title: 'Task 1',
        completed: false,
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: crypto.randomUUID(),
        title: 'Task 2',
        completed: true,
        updatedAt: Date.now() + 1000,
      };

      await queueTaskForSync(task1);
      await queueTaskForSync(task2);

      const queue = await getSyncQueue();
      expect(queue).toHaveLength(2);
    });
  });

  describe('getSyncQueue', () => {
    it('should return empty array when queue is empty', async () => {
      await initDB();
      const queue = await getSyncQueue();
      expect(queue).toEqual([]);
    });

    it('should return all queued tasks', async () => {
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

      for (const task of tasks) {
        await queueTaskForSync(task);
      }

      const queue = await getSyncQueue();
      expect(queue).toHaveLength(2);
    });
  });

  describe('clearSyncQueue', () => {
    it('should clear all tasks from sync queue', async () => {
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

      for (const task of tasks) {
        await queueTaskForSync(task);
      }

      let queue = await getSyncQueue();
      expect(queue).toHaveLength(2);

      await clearSyncQueue();

      queue = await getSyncQueue();
      expect(queue).toHaveLength(0);
    });

    it('should not affect tasks store', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Task',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task);
      await queueTaskForSync(task);

      await clearSyncQueue();

      const queue = await getSyncQueue();
      const tasks = await getTasks();

      expect(queue).toHaveLength(0);
      expect(tasks).toHaveLength(1);
    });

    it('should not throw when queue is already empty', async () => {
      await initDB();
      await expect(clearSyncQueue()).resolves.not.toThrow();
    });
  });

  describe('Integration tests', () => {
    it('should handle complete task lifecycle with sync queue', async () => {
      const task: Task = {
        id: crypto.randomUUID(),
        title: 'Lifecycle Task',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task);
      await queueTaskForSync(task);

      let tasks = await getTasks();
      let queue = await getSyncQueue();
      expect(tasks).toHaveLength(1);
      expect(queue).toHaveLength(1);

      const updatedTask = { ...task, completed: true, updatedAt: Date.now() + 1000 };
      await saveTask(updatedTask);
      await queueTaskForSync(updatedTask);

      tasks = await getTasks();
      queue = await getSyncQueue();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].completed).toBe(true);
      expect(queue).toHaveLength(1);
      expect(queue[0].completed).toBe(true);

      await clearSyncQueue();
      queue = await getSyncQueue();
      expect(queue).toHaveLength(0);

      await deleteTask(task.id);
      tasks = await getTasks();
      expect(tasks).toHaveLength(0);
    });

    it('should maintain separate tasks and sync queue stores', async () => {
      const task1: Task = {
        id: crypto.randomUUID(),
        title: 'Task Only',
        completed: false,
        updatedAt: Date.now(),
      };

      const task2: Task = {
        id: crypto.randomUUID(),
        title: 'Queued Only',
        completed: false,
        updatedAt: Date.now(),
      };

      await saveTask(task1);
      await queueTaskForSync(task2);

      const tasks = await getTasks();
      const queue = await getSyncQueue();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task1.id);
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(task2.id);
    });
  });
});
