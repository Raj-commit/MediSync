const recordService = require('../services/recordService');
const {
  validatePatientId,
  validateRecordsQuery,
  validateEmptyBody,
} = require('../utils/validateRecord');

/**
 * GET /api/v1/records/me
 * Patient retrieves their own medical record.
 * Order of checks: valid JWT, role 'patient', own data from req.user.
 */
async function getOwnRecord(req, res) {
  validateEmptyBody(req.body);
  const query = validateRecordsQuery(req.query);

  const result = await recordService.getPatientRecord(req.user, query);

  res.set('Cache-Control', 'no-store');
  res.status(200).json(result);
}

/**
 * GET /api/v1/records/patient/:patientId
 * Doctor retrieves the medical record of a patient they have a confirmed or completed appointment with.
 * Order of checks: valid JWT, role 'doctor', verifyDoctorAccess (appointment check + anti-enumeration).
 */
async function getPatientRecordByDoctor(req, res) {
  validateEmptyBody(req.body);
  const patientId = validatePatientId(req.params.patientId);
  const query = validateRecordsQuery(req.query);

  const result = await recordService.getRecordForDoctor(req.user._id, patientId, query);

  res.set('Cache-Control', 'no-store');
  res.status(200).json(result);
}

module.exports = {
  getOwnRecord,
  getPatientRecordByDoctor,
};
