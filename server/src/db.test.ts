import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveTask, getTasks, deleteTask } from './db';
import { Task } from './schema';
import db from './db';

describe('db.ts', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM tasks').run();
  });

  afterEach(() => {
    db.prepare('DELETE FROM tasks').run();
  });

  describe('saveTask', () => {
    it('should insert a new task', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);

      const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
      const row: any = stmt.get(task.id);

      expect(row).toBeDefined();
      expect(row.id).toBe(task.id);
      expect(row.title).toBe(task.title);
      expect(row.completed).toBe(0);
      expect(row.deleted).toBe(0);
    });

    it('should handle completed task correctly', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Completed Task',
        completed: true,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);

      const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
      const row: any = stmt.get(task.id);

      expect(row.completed).toBe(1);
    });

    it('should update existing task on conflict', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        title: 'Original Title',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);

      const updatedTask: Task = {
        ...task,
        title: 'Updated Title',
        completed: true,
        updatedAt: Date.now() + 1000,
      };

      saveTask(updatedTask);

      const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
      const row: any = stmt.get(task.id);

      expect(row.title).toBe('Updated Title');
      expect(row.completed).toBe(1);
    });

    it('should handle deleted task correctly', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174003',
        title: 'Deleted Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: true,
      };

      saveTask(task);

      const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
      const row: any = stmt.get(task.id);

      expect(row.deleted).toBe(1);
    });
  });

  describe('getTasks', () => {
    it('should return empty array when no tasks exist', () => {
      const tasks = getTasks();
      expect(tasks).toEqual([]);
    });

    it('should return all tasks', () => {
      const task1: Task = {
        id: '123e4567-e89b-12d3-a456-426614174004',
        title: 'Task 1',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      const task2: Task = {
        id: '123e4567-e89b-12d3-a456-426614174005',
        title: 'Task 2',
        completed: true,
        updatedAt: Date.now() + 1000,
        deleted: false,
      };

      saveTask(task1);
      saveTask(task2);

      const tasks = getTasks();

      expect(tasks).toHaveLength(2);
      expect(tasks.find(t => t.id === task1.id)).toBeDefined();
      expect(tasks.find(t => t.id === task2.id)).toBeDefined();
    });

    it('should convert SQLite integers to booleans correctly', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174006',
        title: 'Boolean Test',
        completed: true,
        updatedAt: Date.now(),
        deleted: true,
      };

      saveTask(task);

      const tasks = getTasks();
      const retrievedTask = tasks.find(t => t.id === task.id);

      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.completed).toBe(true);
      expect(retrievedTask!.deleted).toBe(true);
      expect(typeof retrievedTask!.completed).toBe('boolean');
      expect(typeof retrievedTask!.deleted).toBe('boolean');
    });

    it('should handle false booleans correctly', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174007',
        title: 'False Boolean Test',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);

      const tasks = getTasks();
      const retrievedTask = tasks.find(t => t.id === task.id);

      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.completed).toBe(false);
      expect(retrievedTask!.deleted).toBe(false);
    });
  });

  describe('deleteTask', () => {
    it('should delete a task by id', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174008',
        title: 'Task to Delete',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);

      let tasks = getTasks();
      expect(tasks.find(t => t.id === task.id)).toBeDefined();

      deleteTask(task.id);

      tasks = getTasks();
      expect(tasks.find(t => t.id === task.id)).toBeUndefined();
    });

    it('should not throw error when deleting non-existent task', () => {
      expect(() => {
        deleteTask('non-existent-id');
      }).not.toThrow();
    });

    it('should only delete the specified task', () => {
      const task1: Task = {
        id: '123e4567-e89b-12d3-a456-426614174009',
        title: 'Task 1',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      const task2: Task = {
        id: '123e4567-e89b-12d3-a456-426614174010',
        title: 'Task 2',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task1);
      saveTask(task2);

      deleteTask(task1.id);

      const tasks = getTasks();
      expect(tasks.find(t => t.id === task1.id)).toBeUndefined();
      expect(tasks.find(t => t.id === task2.id)).toBeDefined();
    });
  });

  describe('Integration tests', () => {
    it('should handle complete task lifecycle', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174011',
        title: 'Lifecycle Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: false,
      };

      saveTask(task);
      let tasks = getTasks();
      let retrievedTask = tasks.find(t => t.id === task.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.completed).toBe(false);

      const updatedTask = { ...task, completed: true, updatedAt: Date.now() + 1000 };
      saveTask(updatedTask);
      tasks = getTasks();
      retrievedTask = tasks.find(t => t.id === task.id);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.completed).toBe(true);

      deleteTask(task.id);
      tasks = getTasks();
      expect(tasks.find(t => t.id === task.id)).toBeUndefined();
    });

    it('should handle multiple task operations', () => {
      const tasks: Task[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174012',
          title: 'Task A',
          completed: false,
          updatedAt: Date.now(),
          deleted: false,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174013',
          title: 'Task B',
          completed: true,
          updatedAt: Date.now() + 1000,
          deleted: false,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174014',
          title: 'Task C',
          completed: false,
          updatedAt: Date.now() + 2000,
          deleted: true,
        },
      ];

      tasks.forEach(saveTask);

      let retrievedTasks = getTasks();
      expect(retrievedTasks.find(t => t.id === tasks[0].id)).toBeDefined();
      expect(retrievedTasks.find(t => t.id === tasks[1].id)).toBeDefined();
      expect(retrievedTasks.find(t => t.id === tasks[2].id)).toBeDefined();

      deleteTask(tasks[0].id);
      retrievedTasks = getTasks();
      expect(retrievedTasks.find(t => t.id === tasks[0].id)).toBeUndefined();
      expect(retrievedTasks.find(t => t.id === tasks[1].id)).toBeDefined();
      expect(retrievedTasks.find(t => t.id === tasks[2].id)).toBeDefined();
    });
  });
});
