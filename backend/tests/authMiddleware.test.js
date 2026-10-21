// Must be set before the middleware is used, because the token code reads it.
process.env.JWT_SECRET = 'test-secret-for-middleware-tests';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');

// A tiny app with one protected route, just for these tests.
const app = express();
app.get('/protected', authenticate, (req, res) => res.json({ ok: true }));
app.use(errorHandler);

const SOME_ID = '507f1f77bcf86cd799439011'; // a valid-looking id that is not in any database
const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

describe('authenticate middleware (rejections)', () => {
  it('returns 401 UNAUTHORIZED when there is no Authorization header', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED when the scheme is not Bearer', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 INVALID_TOKEN for a garbage token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN for a token signed with a different secret', async () => {
    const token = jwt.sign({}, 'some-other-secret', { subject: SOME_ID });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN for an expired token', async () => {
    const token = jwt.sign(
      { sub: SOME_ID, exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_SECRET
    );
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN for an unsigned token (alg: none)', async () => {
    const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: SOME_ID })}.`;
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 INVALID_TOKEN when the token has no valid user id', async () => {
    const token = jwt.sign({}, process.env.JWT_SECRET, { subject: 'not-an-object-id' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});