const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  // Fail after 5 seconds instead of the default 30 if MongoDB is unreachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  // Do not log the URI, it can contain the database password.
  console.log('MongoDB connected');
}

module.exports = connectDB;