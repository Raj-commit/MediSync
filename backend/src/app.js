const express = require('express');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const helmet = require('helmet');
const cors = require('cors');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());

// Only the Angular app may call the API from a browser. If CLIENT_URL is not
// set, `false` sends no CORS headers at all, so no origin is allowed.
app.use(cors({ origin: process.env.CLIENT_URL || false }));

app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/doctors', doctorRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
// Must stay last: anything no route handled ends up here.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
