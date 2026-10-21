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
// the server always loads the real role from the database (see step 4).
function signToken(user) {
  return jwt.sign({ role: user.role }, getSecret(), {
    subject: user._id.toString(),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

module.exports = { signToken };