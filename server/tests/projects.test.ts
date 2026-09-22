import request from 'supertest';
import { db } from '../src/lib/db';
import { app, auth, registerUser } from './helpers';

describe('Proyectos', () => {
  it('crea un proyecto', async () => {
    const { token } = await registerUser('proj1@test.com');

    const res = await request(app)
      .post('/api/projects')
      .set(auth(token))
      .send({ name: 'Mi Proyecto', description: 'Descripción' });

    expect(res.status).toBe(201);
  });

  it('lista los proyectos del usuario', async () => {
    const { token } = await registerUser('proj2@test.com');
    await request(app).post('/api/projects').set(auth(token)).send({ name: 'Proyecto A' });
    await request(app).post('/api/projects').set(auth(token)).send({ name: 'Proyecto B' });

    const res = await request(app).get('/api/projects').set(auth(token));

    expect(res.body).toHaveLength(2);
  });

  it('rechaza crear un proyecto sin autenticación', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Sin token' });

    expect(res.status).toBe(401);
  });

  it('rechaza crear un proyecto con un nombre de menos de 3 caracteres', async () => {
    const { token } = await registerUser('proj-short-name@test.com');

    const res = await request(app)
      .post('/api/projects')
      .set(auth(token))
      .send({ name: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('no lista un proyecto archivado para un miembro que no es owner', async () => {
    const owner = await registerUser('proj-archived-owner@test.com');
    const member = await registerUser('proj-archived-member@test.com');
    const created = await request(app)
      .post('/api/projects')
      .set(auth(owner.token))
      .send({ name: 'Proyecto archivado' });

    await request(app)
      .post(`/api/projects/${created.body.id}/members`)
      .set(auth(owner.token))
      .send({ email: 'proj-archived-member@test.com' });
    await db.project.update({
      where: { id: Number(created.body.id.replace('proj-', '')) },
      data: { archived: true },
    });

    const res = await request(app).get('/api/projects').set(auth(member.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
