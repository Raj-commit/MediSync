const prescriptionService = require('../services/prescriptionService');

/**
 * POST /api/v1/prescriptions
 * Doctor creates a digital prescription for a completed appointment.
 */
async function createPrescription(req, res, next) {
  try {
    const prescription = await prescriptionService.createPrescription(req.user, req.body);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ prescription });
  } catch (err) {
    next(err);
  }
}


/**
 * GET /api/v1/prescriptions
 * Lists prescriptions for the logged-in patient or doctor.
 */
async function getPrescriptions(req, res, next) {
  try {
    const result = await prescriptionService.getPrescriptions(req.user, req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    next(err);
  }
}


/**
 * GET /api/v1/prescriptions/:id/pdf
 * Serves the binary PDF for a prescription.
 */
async function getPrescriptionPdf(req, res, next) {
  try {
    const { id, pdfData } = await prescriptionService.getPrescriptionPdf(req.user, req.params.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescription_${id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.send(pdfData);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPrescription,
  getPrescriptions,
  getPrescriptionPdf,
};
