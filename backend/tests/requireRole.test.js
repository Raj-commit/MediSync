const express = require('express');
const request = require('supertest');
const { requireRole } = require('../src/middleware/requireRole');
const errorHandler = require('../src/middleware/errorHandler');

// Builds a tiny app where a stand-in for authenticate sets req.user.
function makeApp(user, ...roles) {
  const app = express();
  const fakeAuthenticate = (req, res, next) => {
    if (user) req.user = user;
    next();
  };
  app.get('/secret', fakeAuthenticate, requireRole(...roles), (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requireRole middleware', () => {
  it('returns 403 FORBIDDEN when the role is not allowed', async () => {
    const res = await request(makeApp({ role: 'patient' }, 'doctor')).get('/secret');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('lets through a user whose role is allowed', async () => {
    const res = await request(makeApp({ role: 'doctor' }, 'doctor')).get('/secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('accepts several roles', async () => {
    const res = await request(makeApp({ role: 'admin' }, 'doctor', 'admin')).get('/secret');
    expect(res.status).toBe(200);
  });

  it('returns 401 when there is no logged-in user', async () => {
    const res = await request(makeApp(null, 'doctor')).get('/secret');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('refuses to be created without roles or with an unknown role', () => {
    expect(() => requireRole()).toThrow();
    expect(() => requireRole('nurse')).toThrow();
  });
});