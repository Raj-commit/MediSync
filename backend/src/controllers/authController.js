const authService = require('../services/authService');

// Express 5 passes errors from async functions to the error handler by itself,
// so no try/catch is needed here.
async function register(req, res) {
  // req.body is undefined in Express 5 when no JSON body was sent.
  const user = await authService.register(req.body);
  res.status(201).json({ user });
}

async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}

// req.user is set by the authenticate middleware.
function me(req, res) {
  res.json({ user: authService.getMe(req.user) });
}

module.exports = { register, login, me };