import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { db } from '../src/lib/db';
import { errorHandler } from '../src/middleware/errors';
import {
  isOwner,
  requireProjectMember,
  requireTaskProjectMember,
} from '../src/middleware/membership';
import { app, auth, createProject, createTask, registerUser } from './helpers';

const errorBody = (code: string, message: string) => ({ error: { code, message, details: [] } });

function middlewareApp(kind: 'project' | 'task', userId?: number) {
  const testApp = express();
  testApp.use((req: Request, _res: Response, next: NextFunction) => {
    if (userId !== undefined) req.user = { userId, email: 'test@test.com' };
    next();
  });
  if (kind === 'project') {
    testApp.get('/:projectId', requireProjectMember(), (_req, res) => res.json({ allowed: true }));
  } else {
    testApp.get('/:taskId', requireTaskProjectMember(), (_req, res) => res.json({ allowed: true }));
  }
  testApp.use(errorHandler);
  return testApp;
}

const numericId = (publicId: string) => Number(publicId.split('-')[1]);

describe('membership middleware branches', () => {
  describe('requireProjectMember', () => {
    it('rechaza una solicitud sin usuario autenticado', async () => {
      // Arrange
      const testApp = middlewareApp('project');
      // Act
      const res = await request(testApp).get('/proj-1');
      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toEqual(errorBody('UNAUTHORIZED', 'Authentication required'));
    });

    it('devuelve 404 para un projectId inválido', async () => {
      // Arrange
      const testApp = middlewareApp('project', 1);
      // Act
      const res = await request(testApp).get('/id-invalido');
      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual(errorBody('NOT_FOUND', 'Project not found'));
    });

    it('devuelve 404 cuando el proyecto no existe', async () => {
      // Arrange
      const user = await registerUser('missing-project@test.com');
      const testApp = middlewareApp('project', numericId(user.id));
      // Act
      const res = await request(testApp).get('/proj-999999');
      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual(errorBody('NOT_FOUND', 'Project not found'));
    });

    it('devuelve 403 cuando el usuario no es miembro', async () => {
      // Arrange
      const owner = await registerUser('project-owner@test.com');
      const outsider = await registerUser('project-outsider@test.com');
      const project = await createProject(owner.token, 'Proyecto privado');
      const testApp = middlewareApp('project', numericId(outsider.id));
      // Act
      const res = await request(testApp).get(`/${project.id}`);
      // Assert
      expect(res.status).toBe(403);
      expect(res.body).toEqual(errorBody('FORBIDDEN', 'You are not a member of this project'));
    });

    it('permite continuar cuando el usuario es miembro', async () => {
      // Arrange
      const owner = await registerUser('allowed-owner@test.com');
      const member = await registerUser('allowed-member@test.com');
      const project = await createProject(owner.token, 'Proyecto compartido');
      await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token))
        .send({ email: 'allowed-member@test.com' });
      const testApp = middlewareApp('project', numericId(member.id));
      // Act
      const res = await request(testApp).get(`/${project.id}`);
      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ allowed: true });
    });
  });

  describe('requireTaskProjectMember', () => {
    it('rechaza una solicitud sin usuario autenticado', async () => {
      // Arrange
      const testApp = middlewareApp('task');
      // Act
      const res = await request(testApp).get('/task-1');
      // Assert
      expect(res.status).toBe(401);
      expect(res.body).toEqual(errorBody('UNAUTHORIZED', 'Authentication required'));
    });

    it('devuelve 404 para un taskId inválido', async () => {
      // Arrange
      const testApp = middlewareApp('task', 1);
      // Act
      const res = await request(testApp).get('/id-invalido');
      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual(errorBody('NOT_FOUND', 'Task not found'));
    });

    it('devuelve 404 cuando la tarea no existe', async () => {
      // Arrange
      const user = await registerUser('missing-task@test.com');
      const testApp = middlewareApp('task', numericId(user.id));
      // Act
      const res = await request(testApp).get('/task-999999');
      // Assert
      expect(res.status).toBe(404);
      expect(res.body).toEqual(errorBody('NOT_FOUND', 'Task not found'));
    });

    it('devuelve 403 cuando el usuario no pertenece al proyecto de la tarea', async () => {
      // Arrange
      const owner = await registerUser('task-owner@test.com');
      const outsider = await registerUser('task-outsider@test.com');
      const project = await createProject(owner.token, 'Proyecto con tarea');
      const task = await createTask(owner.token, project.id, { title: 'Tarea privada' });
      const testApp = middlewareApp('task', numericId(outsider.id));
      // Act
      const res = await request(testApp).get(`/${task.id}`);
      // Assert
      expect(res.status).toBe(403);
      expect(res.body).toEqual(errorBody('FORBIDDEN', 'You are not a member of this project'));
    });

    it('permite continuar cuando el usuario pertenece al proyecto de la tarea', async () => {
      // Arrange
      const owner = await registerUser('task-allowed@test.com');
      const project = await createProject(owner.token, 'Proyecto permitido');
      const task = await createTask(owner.token, project.id, { title: 'Tarea visible' });
      const testApp = middlewareApp('task', numericId(owner.id));
      // Act
      const res = await request(testApp).get(`/${task.id}`);
      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ allowed: true });
    });
  });

  describe('isOwner', () => {
    it('responde true para el propietario del proyecto', async () => {
      // Arrange
      const owner = await registerUser('is-owner@test.com');
      const project = await createProject(owner.token, 'Proyecto propio');
      const testApp = express().get('/check', async (_req, res) => {
        res.json({ owner: await isOwner(numericId(owner.id), numericId(project.id)) });
      });
      // Act
      const res = await request(testApp).get('/check');
      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ owner: true });
    });

    it('responde false para otro usuario y para un proyecto inexistente', async () => {
      // Arrange
      const owner = await registerUser('is-owner-real@test.com');
      const outsider = await registerUser('is-owner-false@test.com');
      const project = await createProject(owner.token, 'Proyecto ajeno');
      const testApp = express().get('/check', async (_req, res) => {
        res.json({
          otherUser: await isOwner(numericId(outsider.id), numericId(project.id)),
          missingProject: await isOwner(numericId(owner.id), 999999),
        });
      });
      // Act
      const res = await request(testApp).get('/check');
      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ otherUser: false, missingProject: false });
    });
  });

  it('envía errores inesperados de base de datos al error handler', async () => {
    // Arrange
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const dbSpy = jest.spyOn(db.project, 'findUnique').mockRejectedValueOnce(new Error('DB unavailable'));
    const testApp = middlewareApp('project', 1);
    // Act
    const res = await request(testApp).get('/proj-1');
    // Assert
    expect(res.status).toBe(500);
    expect(res.body).toEqual(errorBody('INTERNAL', 'Unexpected server error'));
    dbSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
