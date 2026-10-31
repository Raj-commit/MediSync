const symptomCheckService = require("../services/symptomCheckService");
const { validateSymptomCheckInput } = require("../utils/validateSymptomCheck");

/**
 * POST /api/v1/symptom-checks
 * Authenticated patient submits symptoms for preliminary AI assessment.
 */
async function checkSymptoms(req, res, next) {
  try {
    const { symptoms } = validateSymptomCheckInput(req.body);
    const result = await symptomCheckService.createSymptomCheck(
      req.user.id,
      symptoms,
    );

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/symptom-checks
 * Authenticated patient lists their own past symptom check results.
 */
async function getSymptomChecks(req, res, next) {
  try {
    const data = await symptomCheckService.getSymptomChecks(
      req.user.id,
      req.query,
    );

    res.setHeader("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkSymptoms,
  getSymptomChecks,
};
