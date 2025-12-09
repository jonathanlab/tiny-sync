import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { setupWebSocket, broadcastTask } from './websocket';
import { Task } from './schema';
import http from 'http';

describe('websocket.ts', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let clients: WebSocket[] = [];

  beforeEach(() => {
    server = http.createServer();
    setupWebSocket(server);

    return new Promise<void>((resolve) => {
      server.listen(0, () => {
        resolve();
      });
    });
  });

  afterEach(() => {
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    clients = [];

    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const connectClient = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Invalid server address'));
        return;
      }

      const port = address.port;
      const client = new WebSocket(`ws://localhost:${port}/sync`);

      client.on('open', () => {
        clients.push(client);
        resolve(client);
      });

      client.on('error', reject);
    });
  };

  describe('setupWebSocket', () => {
    it('should set up WebSocket server on /sync path', async () => {
      const client = await connectClient();
      expect(client.readyState).toBe(WebSocket.OPEN);
    });

    it('should accept multiple client connections', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();
      const client3 = await connectClient();

      expect(client1.readyState).toBe(WebSocket.OPEN);
      expect(client2.readyState).toBe(WebSocket.OPEN);
      expect(client3.readyState).toBe(WebSocket.OPEN);
    });

    it('should handle client disconnection', async () => {
      const client = await connectClient();
      expect(client.readyState).toBe(WebSocket.OPEN);

      return new Promise<void>((resolve) => {
        client.on('close', () => {
          expect(client.readyState).toBe(WebSocket.CLOSED);
          resolve();
        });
        client.close();
      });
    });
  });

  describe('broadcastTask', () => {
    it('should broadcast task to all connected clients', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Task',
        completed: false,
        updatedAt: Date.now(),
      };

      const receivedMessages: Task[] = [];

      return new Promise<void>((resolve) => {
        let receivedCount = 0;

        const messageHandler = (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          receivedMessages.push(parsed);
          receivedCount++;

          if (receivedCount === 2) {
            expect(receivedMessages).toHaveLength(2);
            expect(receivedMessages[0]).toEqual(task);
            expect(receivedMessages[1]).toEqual(task);
            resolve();
          }
        };

        client1.on('message', messageHandler);
        client2.on('message', messageHandler);

        broadcastTask(task);
      });
    });

    it('should not send to clients that are not open', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Test Task 2',
        completed: false,
        updatedAt: Date.now(),
      };

      await new Promise<void>((resolve) => {
        client2.on('close', resolve);
        client2.close();
      });

      return new Promise<void>((resolve) => {
        client1.on('message', (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          expect(parsed).toEqual(task);
          resolve();
        });

        broadcastTask(task);
      });
    });

    it('should handle deleted tasks', async () => {
      const client = await connectClient();

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        title: 'Deleted Task',
        completed: false,
        updatedAt: Date.now(),
        deleted: true,
      };

      return new Promise<void>((resolve) => {
        client.on('message', (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          expect(parsed).toEqual(task);
          expect(parsed.deleted).toBe(true);
          resolve();
        });

        broadcastTask(task);
      });
    });

    it('should serialize task with all properties correctly', async () => {
      const client = await connectClient();

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174003',
        title: 'Complex Task',
        completed: true,
        updatedAt: 1234567890,
        deleted: false,
      };

      return new Promise<void>((resolve) => {
        client.on('message', (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          expect(parsed.id).toBe(task.id);
          expect(parsed.title).toBe(task.title);
          expect(parsed.completed).toBe(true);
          expect(parsed.updatedAt).toBe(1234567890);
          expect(parsed.deleted).toBe(false);
          resolve();
        });

        broadcastTask(task);
      });
    });

    it('should broadcast to no clients if none are connected', () => {
      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174004',
        title: 'No Clients Task',
        completed: false,
        updatedAt: Date.now(),
      };

      expect(() => {
        broadcastTask(task);
      }).not.toThrow();
    });

    it('should handle rapid successive broadcasts', async () => {
      const client = await connectClient();

      const tasks: Task[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174005',
          title: 'Task 1',
          completed: false,
          updatedAt: Date.now(),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174006',
          title: 'Task 2',
          completed: true,
          updatedAt: Date.now() + 1,
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174007',
          title: 'Task 3',
          completed: false,
          updatedAt: Date.now() + 2,
        },
      ];

      const receivedTasks: Task[] = [];

      return new Promise<void>((resolve) => {
        client.on('message', (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          receivedTasks.push(parsed);

          if (receivedTasks.length === 3) {
            expect(receivedTasks).toHaveLength(3);
            expect(receivedTasks[0].title).toBe('Task 1');
            expect(receivedTasks[1].title).toBe('Task 2');
            expect(receivedTasks[2].title).toBe('Task 3');
            resolve();
          }
        });

        tasks.forEach(task => broadcastTask(task));
      });
    });
  });

  describe('Integration tests', () => {
    it('should handle client connection, broadcast, and disconnection', async () => {
      const client = await connectClient();

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174008',
        title: 'Integration Test',
        completed: false,
        updatedAt: Date.now(),
      };

      await new Promise<void>((resolve) => {
        client.on('message', (data: Buffer) => {
          const parsed = JSON.parse(data.toString());
          expect(parsed).toEqual(task);
          resolve();
        });

        broadcastTask(task);
      });

      await new Promise<void>((resolve) => {
        client.on('close', resolve);
        client.close();
      });

      expect(client.readyState).toBe(WebSocket.CLOSED);
    });

    it('should broadcast to subset of clients after some disconnect', async () => {
      const client1 = await connectClient();
      const client2 = await connectClient();
      const client3 = await connectClient();

      await new Promise<void>((resolve) => {
        client2.on('close', resolve);
        client2.close();
      });

      const task: Task = {
        id: '123e4567-e89b-12d3-a456-426614174009',
        title: 'Subset Test',
        completed: false,
        updatedAt: Date.now(),
      };

      let receivedCount = 0;

      return new Promise<void>((resolve) => {
        const messageHandler = () => {
          receivedCount++;
          if (receivedCount === 2) {
            expect(receivedCount).toBe(2);
            resolve();
          }
        };

        client1.on('message', messageHandler);
        client3.on('message', messageHandler);

        broadcastTask(task);
      });
    });
  });
});
