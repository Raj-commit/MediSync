const recordService = require('../services/recordService');
const {
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

module.exports = {
  getOwnRecord,
};
