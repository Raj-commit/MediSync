// Must be set before the app handles a request, because the token code reads it.
process.env.JWT_SECRET = 'test-secret-for-me-tests';

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/auth/me (without a valid token)', () => {
  it('returns 401 UNAUTHORIZED when no token is sent', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toBeDefined();
  });

  it('returns 401 INVALID_TOKEN for a fake token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer fake.token.value');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});