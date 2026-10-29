// backend/scripts/create-test-chat-appointment.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Patient, Doctor } = require('../src/models/User');
const Slot = require('../src/models/Slot');
const Appointment = require('../src/models/Appointment');
const { signToken } = require('../src/utils/token');

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medisync';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB at', uri);

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Ensure a patient exists
  let patient = await User.findOne({ email: 'chat.patient@example.com' });
  if (!patient) {
    patient = await Patient.create({
      role: 'patient',
      name: 'Rohan Patient',
      email: 'chat.patient@example.com',
      phone: '+919876543201',
      passwordHash,
      dateOfBirth: new Date('1995-01-01'),
      address: '101 Marine Lines, Mumbai',
      isActive: true,
    });
    console.log('Created patient:', patient.name);
  }

  // 2. Ensure a doctor exists
  let doctor = await User.findOne({ email: 'chat.doctor@example.com' });
  if (!doctor) {
    doctor = await Doctor.create({
      role: 'doctor',
      name: 'Dr. Priya Sharma',
      email: 'chat.doctor@example.com',
      phone: '+919876543202',
      passwordHash,
      specialisations: ['General Medicine', 'Cardiology'],
      qualification: 'MBBS, MD',
      isActive: true,
    });
    console.log('Created doctor:', doctor.name);
  }

  // 3. Ensure a slot exists
  const startTime = new Date(Date.now() + 24 * 3600 * 1000);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  let slot = await Slot.findOne({ doctor: doctor._id });
  if (!slot) {
    slot = await Slot.create({
      doctor: doctor._id,
      startTime,
      endTime,
      isBooked: true,
    });
    console.log('Created slot for doctor');
  }

  // 4. Ensure a confirmed appointment exists
  let appointment = await Appointment.findOne({
    patient: patient._id,
    doctor: doctor._id,
    status: 'confirmed',
  });

  if (!appointment) {
    appointment = await Appointment.create({
      patient: patient._id,
      doctor: doctor._id,
      slot: slot._id,
      dateTime: startTime,
      endTime,
      status: 'confirmed',
      chatSeq: 0,
    });
    console.log('Created confirmed appointment:', appointment._id);
  } else {
    console.log('Existing confirmed appointment found:', appointment._id);
  }

  const patientToken = signToken(patient);
  const doctorToken = signToken(doctor);

  console.log('\n================ TEST DETAILS ================');
  console.log('Appointment ID:', appointment._id.toString());
  console.log('Patient Name:  ', patient.name);
  console.log('Patient Token: ', patientToken);
  console.log('\nDoctor Name:   ', doctor.name);
  console.log('Doctor Token:  ', doctorToken);
  console.log('==============================================\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Failed to create test appointment:', err);
  process.exit(1);
});
