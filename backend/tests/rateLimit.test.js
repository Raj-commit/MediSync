const express = require('express');
const request = require('supertest');
const { createLoginLimiter } = require('../src/middleware/rateLimiters');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');

// A tiny app with a low limit, so the test needs only a few requests.
// /fail always answers 401 (like a wrong password), /ok always answers 200.
function makeApp(limit) {
  const app = express();
  const limiter = createLoginLimiter({ limit });
  app.post('/fail', limiter, (req, res, next) => {
    next(new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'));
  });
  app.post('/ok', limiter, (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('login rate limiter', () => {
  it('blocks with 429 TOO_MANY_ATTEMPTS after too many failed attempts', async () => {
    const app = makeApp(2);

    expect((await request(app).post('/fail')).status).toBe(401);
    expect((await request(app).post('/fail')).status).toBe(401);

    const blocked = await request(app).post('/fail');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      message: 'Too many login attempts. Please try again later.',
      code: 'TOO_MANY_ATTEMPTS',
    });
  });

  it('does not count successful requests', async () => {
    const app = makeApp(2);

    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/ok');
      expect(res.status).toBe(200);
    }
  });
});