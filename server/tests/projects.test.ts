import request from 'supertest';
import { app, auth, createProject, registerUser } from './helpers';

const errorBody = (code: string, message: string) => ({ error: { code, message, details: [] } });

describe('projects.controller', () => {
  it('crea y serializa un proyecto', async () => {
    // Arrange
    const owner = await registerUser('create@test.com');
    // Act
    const res = await request(app).post('/api/projects').set(auth(owner.token))
      .send({ name: '  Mi proyecto  ', description: '  Descripción  ' });
    // Assert
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.stringMatching(/^proj-\d+$/), name: 'Mi proyecto',
      description: 'Descripción', ownerId: owner.id, archived: false, createdAt: expect.any(String) });
  });

  it('rechaza un proyecto duplicado', async () => {
    // Arrange
    const owner = await registerUser('duplicate@test.com');
    await createProject(owner.token, 'Repetido');
    // Act
    const res = await request(app).post('/api/projects').set(auth(owner.token)).send({ name: 'Repetido' });
    // Assert
    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody('CONFLICT', 'You already have a project with that name'));
  });

  it('rechaza un nombre demasiado largo al crear', async () => {
    // Arrange
    const owner = await registerUser('invalid-create@test.com');
    // Act
    const res = await request(app).post('/api/projects').set(auth(owner.token)).send({ name: 'a'.repeat(101) });
    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('VALIDATION_ERROR', 'name must be between 3 and 100 characters'));
  });

  it('rechaza una descripción que no es texto', async () => {
    // Arrange
    const owner = await registerUser('invalid-description@test.com');
    // Act
    const res = await request(app).post('/api/projects').set(auth(owner.token))
      .send({ name: 'Proyecto válido', description: 123 });
    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('VALIDATION_ERROR', 'description must be a string'));
  });

  it('lista los proyectos con estado y cuerpo completo', async () => {
    // Arrange
    const owner = await registerUser('list@test.com');
    const project = await createProject(owner.token, 'Listado');
    // Act
    const res = await request(app).get('/api/projects').set(auth(owner.token));
    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ ...project, createdAt: expect.any(String) }]);
  });

  it('actualiza un proyecto del owner', async () => {
    // Arrange
    const owner = await registerUser('update@test.com');
    const project = await createProject(owner.token, 'Anterior');
    // Act
    const res = await request(app).patch(`/api/projects/${project.id}`).set(auth(owner.token))
      .send({ name: '  Nuevo nombre  ', description: '  Nueva  ' });
    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...project, name: 'Nuevo nombre', description: 'Nueva', createdAt: expect.any(String) });
  });

  it('devuelve 404 al actualizar un id inválido', async () => {
    // Arrange
    const owner = await registerUser('bad-id@test.com');
    // Act
    const res = await request(app).patch('/api/projects/invalido').set(auth(owner.token)).send({ name: 'Nuevo' });
    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody('NOT_FOUND', 'Project not found'));
  });

  it('impide que un miembro edite el proyecto', async () => {
    // Arrange
    const owner = await registerUser('edit-owner@test.com');
    const member = await registerUser('edit-member@test.com');
    const project = await createProject(owner.token, 'Equipo');
    await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'edit-member@test.com' });
    // Act
    const res = await request(app).patch(`/api/projects/${project.id}`).set(auth(member.token)).send({ name: 'Prohibido' });
    // Assert
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody('FORBIDDEN', 'Only the project owner can edit it'));
  });

  it('oculta con 404 el proyecto a un usuario ajeno', async () => {
    // Arrange
    const owner = await registerUser('private-owner@test.com');
    const outsider = await registerUser('outsider@test.com');
    const project = await createProject(owner.token, 'Privado');
    // Act
    const res = await request(app).patch(`/api/projects/${project.id}`).set(auth(outsider.token)).send({ name: 'Prohibido' });
    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody('NOT_FOUND', 'Project not found'));
  });

  it('rechaza nombre duplicado al actualizar', async () => {
    // Arrange
    const owner = await registerUser('rename@test.com');
    const project = await createProject(owner.token, 'Uno');
    await createProject(owner.token, 'Dos');
    // Act
    const res = await request(app).patch(`/api/projects/${project.id}`).set(auth(owner.token)).send({ name: 'Dos' });
    // Assert
    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody('CONFLICT', 'You already have a project with that name'));
  });

  it('rechaza un nombre corto al actualizar', async () => {
    // Arrange
    const owner = await registerUser('short-update@test.com');
    const project = await createProject(owner.token, 'Nombre correcto');
    // Act
    const res = await request(app).patch(`/api/projects/${project.id}`).set(auth(owner.token)).send({ name: 'ab' });
    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('VALIDATION_ERROR', 'name must be between 3 and 100 characters'));
  });

  it('elimina un proyecto del owner', async () => {
    // Arrange
    const owner = await registerUser('delete@test.com');
    const project = await createProject(owner.token, 'Eliminar');
    // Act
    const res = await request(app).delete(`/api/projects/${project.id}`).set(auth(owner.token));
    // Assert
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('agrega un miembro y normaliza su email', async () => {
    // Arrange
    const owner = await registerUser('member-owner@test.com');
    const member = await registerUser('member@test.com');
    const project = await createProject(owner.token, 'Miembros');
    // Act
    const res = await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token))
      .send({ email: '  MEMBER@TEST.COM  ' });
    // Assert
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ projectId: project.id, userId: member.id, email: 'member@test.com', role: 'MEMBER' });
  });

  it('rechaza email inválido al agregar un miembro', async () => {
    // Arrange
    const owner = await registerUser('email-owner@test.com');
    const project = await createProject(owner.token, 'Email');
    // Act
    const res = await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'mal' });
    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('VALIDATION_ERROR', 'email must be a valid address'));
  });

  it('rechaza agregar a un usuario inexistente o repetido', async () => {
    // Arrange
    const owner = await registerUser('missing-owner@test.com');
    const project = await createProject(owner.token, 'Sin usuario');
    // Act
    const res = await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'nobody@test.com' });
    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody('NOT_FOUND', 'No user found with that email'));
  });

  it('rechaza agregar dos veces al mismo miembro', async () => {
    // Arrange
    const owner = await registerUser('repeat-owner@test.com');
    await registerUser('repeat-member@test.com');
    const project = await createProject(owner.token, 'Miembro repetido');
    await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'repeat-member@test.com' });
    // Act
    const res = await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'repeat-member@test.com' });
    // Assert
    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody('CONFLICT', 'User is already a member of this project'));
  });

  it('elimina un miembro', async () => {
    // Arrange
    const owner = await registerUser('remove-owner@test.com');
    const member = await registerUser('remove-member@test.com');
    const project = await createProject(owner.token, 'Baja');
    await request(app).post(`/api/projects/${project.id}/members`).set(auth(owner.token)).send({ email: 'remove-member@test.com' });
    // Act
    const res = await request(app).delete(`/api/projects/${project.id}/members/${member.id}`).set(auth(owner.token));
    // Assert
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('impide eliminar al owner de sus miembros', async () => {
    // Arrange
    const owner = await registerUser('self-owner@test.com');
    const project = await createProject(owner.token, 'Con owner');
    // Act
    const res = await request(app).delete(`/api/projects/${project.id}/members/${owner.id}`).set(auth(owner.token));
    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody('VALIDATION_ERROR', 'The project owner cannot be removed from the project'));
  });

  it('devuelve 404 al eliminar un usuario que no es miembro', async () => {
    // Arrange
    const owner = await registerUser('no-member-owner@test.com');
    const outsider = await registerUser('no-member@test.com');
    const project = await createProject(owner.token, 'Sin miembro');
    // Act
    const res = await request(app).delete(`/api/projects/${project.id}/members/${outsider.id}`).set(auth(owner.token));
    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody('NOT_FOUND', 'User is not a member of this project'));
  });

  it('impide que alguien distinto del owner elimine miembros', async () => {
    // Arrange
    const owner = await registerUser('forbidden-owner@test.com');
    const outsider = await registerUser('forbidden-member@test.com');
    const project = await createProject(owner.token, 'Administrado');
    // Act
    const res = await request(app).delete(`/api/projects/${project.id}/members/${outsider.id}`).set(auth(outsider.token));
    // Assert
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody('FORBIDDEN', 'Only the project owner can manage members'));
  });
});
