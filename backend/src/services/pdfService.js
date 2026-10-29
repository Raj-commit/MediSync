const AppError = require('../utils/AppError');

const DJANGO_TIMEOUT_MS = 5000; // 5 seconds
const MAX_PDF_BYTES = 2 * 1024 * 1024; // 2 MB
const PDF_MAGIC_BYTES = '%PDF-';

/**
 * Calls the internal Django microservice to render a digital prescription PDF.
 *
 * Rules & security:
 * 1. Authenticates via the shared secret in the X-Service-Key header (never logged).
 * 2. Transmits only the 5 required fields (prescriptionId, patientName, doctorName, issuedDate, items).
 * 3. Enforces a 5-second timeout and 2 MB size cap.
 * 4. Validates that the response starts with the %PDF- header and is of type application/pdf.
 * 5. Maps all network, timeout, validation, and internal service failures to a single user-safe
 *    502 PDF_SERVICE_UNAVAILABLE error without leaking Django tracebacks or keys.
 *
 * @param {Object} params
 * @param {string} params.prescriptionId
 * @param {string} params.patientName
 * @param {string} params.doctorName
 * @param {string} params.issuedDate - YYYY-MM-DD
 * @param {Array<{medicine: string, dosage: string, instructions: string}>} params.items
 * @returns {Promise<Buffer>} The validated PDF binary Buffer
 */
async function generatePrescriptionPdf({ prescriptionId, patientName, doctorName, issuedDate, items }) {
  const baseUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const serviceKey = process.env.AI_SERVICE_KEY;

  if (!serviceKey || typeof serviceKey !== 'string' || serviceKey.trim() === '') {
    console.error('PDF generation misconfigured: AI_SERVICE_KEY is missing or empty.');
    throw new AppError(
      502,
      'PDF_SERVICE_UNAVAILABLE',
      'Prescription PDF service is temporarily unavailable. Please try again later.'
    );
  }

  const endpoint = `${baseUrl}/api/prescriptions/pdf`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': serviceKey,
      },
      body: JSON.stringify({
        prescriptionId: String(prescriptionId),
        patientName: String(patientName).trim(),
        doctorName: String(doctorName).trim(),
        issuedDate: String(issuedDate).trim(),
        items: items.map((item) => ({
          medicine: String(item.medicine).trim(),
          dosage: String(item.dosage).trim(),
          instructions: String(item.instructions).trim(),
        })),
      }),
      signal: AbortSignal.timeout(DJANGO_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`PDF service returned HTTP ${response.status}`);
      throw new AppError(
        502,
        'PDF_SERVICE_UNAVAILABLE',
        'Prescription PDF service is temporarily unavailable. Please try again later.'
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/pdf')) {
      console.error(`PDF service returned non-PDF content type: "${contentType}"`);
      throw new AppError(
        502,
        'PDF_SERVICE_UNAVAILABLE',
        'Prescription PDF service is temporarily unavailable. Please try again later.'
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    if (pdfBuffer.length === 0) {
      console.error('PDF service returned empty body');
      throw new AppError(
        502,
        'PDF_SERVICE_UNAVAILABLE',
        'Prescription PDF service is temporarily unavailable. Please try again later.'
      );
    }

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      console.error(`PDF generated exceeds maximum allowed size (${pdfBuffer.length} bytes > 2 MB)`);
      throw new AppError(
        502,
        'PDF_SERVICE_UNAVAILABLE',
        'Prescription PDF service is temporarily unavailable. Please try again later.'
      );
    }

    // Verify magic bytes header
    if (!pdfBuffer.subarray(0, 5).toString('ascii').startsWith(PDF_MAGIC_BYTES)) {
      console.error('PDF service returned payload missing %PDF- header');
      throw new AppError(
        502,
        'PDF_SERVICE_UNAVAILABLE',
        'Prescription PDF service is temporarily unavailable. Please try again later.'
      );
    }

    return pdfBuffer;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    console.error('Django PDF generation request failed:', err.message || err);
    throw new AppError(
      502,
      'PDF_SERVICE_UNAVAILABLE',
      'Prescription PDF service is temporarily unavailable. Please try again later.'
    );
  }
}

module.exports = {
  generatePrescriptionPdf,
  DJANGO_TIMEOUT_MS,
  MAX_PDF_BYTES,
  PDF_MAGIC_BYTES,
};
