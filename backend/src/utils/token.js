const jwt = require('jsonwebtoken');

// The secret only ever comes from the environment, never from the code.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  }
  return secret;
}

// `sub` (subject) holds the user id. The role is included for convenience, but
// the server always loads the real role from the database (see auth middleware).
function signToken(user) {
  return jwt.sign({ role: user.role }, getSecret(), {
    subject: user._id.toString(),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// Throws a JsonWebTokenError (or TokenExpiredError) if the token is fake,
// changed, or expired. Only HS256 is accepted, so nobody can sneak in a token
// that claims to need no signature ("alg: none").
function verifyToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
}

module.exports = { signToken, verifyToken };