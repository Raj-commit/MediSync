const authService = require('../services/authService');

// Express 5 passes errors from async functions to the error handler by itself,
// so no try/catch is needed here.
async function register(req, res) {
  // req.body is undefined in Express 5 when no JSON body was sent.
  const user = await authService.register(req.body);
  res.status(201).json({ user });
}

module.exports = { register };