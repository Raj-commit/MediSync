// Helpers for tests that need a real MongoDB.
// Tests use a SEPARATE database (MONGODB_URI_TEST) and delete everything in it,
// so this file refuses to run unless that database is clearly a test database.
const path = require('path');
const mongoose = require('mongoose');

// Load backend/.env no matter which folder the tests are started from.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

// Pulls the database name out of a connection string, for example
// mongodb://127.0.0.1:27017/medisync_test?x=y  ->  medisync_test
function databaseName(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(uri || '');
  return match ? decodeURIComponent(match[1]) : '';
}

// Never print the URI itself in an error: it can contain a password.
function getTestUri() {
  const uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    throw new Error('MONGODB_URI_TEST is not set. Add it to backend/.env (see .env.example).');
  }
  const name = databaseName(uri);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run: the test database name must end with "_test" (found "${name || 'none'}").`
    );
  }
  if (databaseName(process.env.MONGODB_URI) === name) {
    throw new Error('Refusing to run: MONGODB_URI_TEST must not be the same database as MONGODB_URI.');
  }
  return uri;
}

async function connectTestDB() {
  await mongoose.connect(getTestUri(), {
    serverSelectionTimeoutMS: 5000,
    // Workaround for a known bug (MongoDB driver NODE-7832, drivers 7.6 and
    // later): inside Jest the driver cannot load Node's "os" module, so it sends
    // an incomplete handshake and the server answers "Missing required
    // sub-document 'driver'". Giving the driver "os" directly avoids it.
    // Only tests need this. Remove it once the driver fixes the bug.
    runtimeAdapters: { os: require('os') },
  });
}

// Deletes every document, but keeps the collections and their indexes.
async function clearTestDB() {
  // Second safety check, right before anything is deleted.
  if (!mongoose.connection.name.endsWith('_test')) {
    throw new Error('Refusing to clear a database whose name does not end with "_test".');
  }
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function closeTestDB() {
  await mongoose.disconnect();
}

module.exports = { connectTestDB, clearTestDB, closeTestDB };