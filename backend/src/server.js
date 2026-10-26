// Load .env first: app.js reads CLIENT_URL as soon as it is required.
require('dotenv').config({ quiet: true });

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./sockets');
const { startReminderJob } = require('./services/reminderService');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    startReminderJob();

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`API listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
