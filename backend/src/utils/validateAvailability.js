const AppError = require('./AppError');

const SLOT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FUTURE_DAYS = 60;
const MAX_SLOTS_PER_REQUEST = 50;

/**
 * Validates a single ISO 8601 UTC date string.
 * Rejects numbers, objects, arrays, and impossible calendar dates (e.g. Feb 31).
 */
function parseIsoUtcDate(val, fieldName) {
  if (typeof val !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be an ISO 8601 UTC string`);
  }

  // Strict ISO 8601 UTC format check (YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ssZ)
  const isoUtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  if (!isoUtcRegex.test(val)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} must be an ISO 8601 string in UTC (e.g. 2026-11-02T04:30:00.000Z)`
    );
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is an invalid date`);
  }

  // Check impossible dates (e.g. 2026-02-31 rolls over to 2026-03-03 in Date constructor)
  const isoString = d.toISOString();
  const normalizedInput = val.includes('.')
    ? val.replace(/\.(\d+)Z$/, (m, ms) => `.${ms.padEnd(3, '0').slice(0, 3)}Z`)
    : val.replace(/Z$/, '.000Z');

  if (isoString !== normalizedInput) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} contains an impossible calendar date`);
  }

  return d;
}

/**
 * Validates a single slot object { startTime, endTime }.
 */
function validateSlot(slot, now, maxFutureDate) {
  if (typeof slot !== 'object' || slot === null || Array.isArray(slot)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Each slot must be an object with startTime and endTime'
    );
  }

  const { startTime, endTime } = slot;
  if (!startTime || !endTime) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startTime and endTime are required for each slot');
  }

  const start = parseIsoUtcDate(startTime, 'startTime');
  const end = parseIsoUtcDate(endTime, 'endTime');

  if (start.getTime() <= now.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Slot startTime must be in the future');
  }

  if (start.getTime() > maxFutureDate.getTime()) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Slot startTime cannot be more than ${MAX_FUTURE_DAYS} days in the future`
    );
  }

  if (end.getTime() - start.getTime() !== SLOT_DURATION_MS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Slot duration must be exactly 30 minutes (endTime must be 30 minutes after startTime)'
    );
  }

  return { startTime: start, endTime: end };
}

/**
 * Validates an array of slots:
 * - Must be an array with at most 50 slots
 * - Each slot is 30 mins, in future, <= 60 days
 * - No overlaps between slots in the array
 */
function validateSlotsList(slots, now = new Date()) {
  if (!Array.isArray(slots)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'slots must be an array');
  }

  if (slots.length > MAX_SLOTS_PER_REQUEST) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `A request may contain at most ${MAX_SLOTS_PER_REQUEST} slots`
    );
  }

  const maxFutureDate = new Date(now.getTime() + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000);

  const validatedSlots = slots.map((s) => validateSlot(s, now, maxFutureDate));

  // Sort by startTime to check overlaps
  validatedSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (let i = 0; i < validatedSlots.length - 1; i++) {
    const current = validatedSlots[i];
    const next = validatedSlots[i + 1];

    if (current.endTime.getTime() > next.startTime.getTime()) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Slots cannot overlap: ${current.startTime.toISOString()} - ${current.endTime.toISOString()} overlaps with ${next.startTime.toISOString()} - ${next.endTime.toISOString()}`
      );
    }
  }

  return validatedSlots;
}

module.exports = {
  SLOT_DURATION_MS,
  MAX_FUTURE_DAYS,
  MAX_SLOTS_PER_REQUEST,
  parseIsoUtcDate,
  validateSlot,
  validateSlotsList,
};
