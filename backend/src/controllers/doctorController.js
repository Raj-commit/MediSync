const doctorService = require('../services/doctorService');

// GET /api/v1/doctors
// Lists and searches active doctors for patients.
async function listDoctors(req, res) {
  const result = await doctorService.listDoctors(req.query);
  res.json(result);
}

module.exports = {
  listDoctors,
};
