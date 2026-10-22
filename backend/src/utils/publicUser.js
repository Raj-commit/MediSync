// The only user fields the API ever sends back. Never add passwordHash here.
function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

module.exports = toPublicUser;