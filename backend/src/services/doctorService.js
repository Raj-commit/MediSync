const { Doctor } = require('../models/User');
const Slot = require('../models/Slot');
const { validateSlotsList } = require('../utils/validateAvailability');
const AppError = require('../utils/AppError');

const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const ALLOWED_QUERY_KEYS = ['name', 'specialisation', 'page', 'limit'];

// Escapes special regex characters so user input is treated as literal search text.
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// Validates query parameters: prevents NoSQL injection (objects/arrays/unknown keys),
// limits lengths, and ensures page/limit are valid positive integers.
function validateDoctorsQuery(query) {
  const q =
    query !== null && typeof query === 'object' && !Array.isArray(query) ? query : {};

  // Reject unexpected or bracketed parameters (e.g. name[$gt])
  for (const key of Object.keys(q)) {
    if (!ALLOWED_QUERY_KEYS.includes(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Unknown query parameter: ${key}`);
    }
  }

  let name;
  if (q.name !== undefined) {
    if (typeof q.name !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Name search must be a single string');
    }
    const trimmed = q.name.trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Name search must be at most ${MAX_SEARCH_LENGTH} characters`
      );
    }
    if (trimmed.length > 0) {
      name = trimmed;
    }
  }

  let specialisation;
  if (q.specialisation !== undefined) {
    if (typeof q.specialisation !== 'string') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Specialisation search must be a single string'
      );
    }
    const trimmed = q.specialisation.trim();
    if (trimmed.length > MAX_SEARCH_LENGTH) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Specialisation search must be at most ${MAX_SEARCH_LENGTH} characters`
      );
    }
    if (trimmed.length > 0) {
      specialisation = trimmed;
    }
  }

  let page = DEFAULT_PAGE;
  if (q.page !== undefined) {
    if (typeof q.page !== 'string' && typeof q.page !== 'number') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Page must be a positive integer');
    }
    const parsedPage = Number(q.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Page must be a positive integer');
    }
    page = parsedPage;
  }

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    if (typeof q.limit !== 'string' && typeof q.limit !== 'number') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Limit must be a positive integer');
    }
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Limit must be between 1 and ${MAX_LIMIT}`
      );
    }
    limit = parsedLimit;
  }

  return { name, specialisation, page, limit };
}

// Searches and lists active doctors for patient appointment booking (UC-04 step 1).
// Only returns public fields: id, name, specialisations, qualification.
// Never exposes email, phone, or passwordHash.
async function listDoctors(queryParams) {
  const { name, specialisation, page, limit } = validateDoctorsQuery(queryParams);

  const filter = {
    isActive: true,
  };

  if (name) {
    filter.name = { $regex: escapeRegex(name), $options: 'i' };
  }

  if (specialisation) {
    filter.specialisations = { $regex: escapeRegex(specialisation), $options: 'i' };
  }

  const skip = (page - 1) * limit;

  const [total, docs] = await Promise.all([
    Doctor.countDocuments(filter),
    Doctor.find(filter)
      .select('_id name specialisations qualification')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const doctors = docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    specialisations: doc.specialisations || [],
    qualification: doc.qualification,
  }));

  return {
    doctors,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

// GET /api/v1/doctors/me/availability
// The logged-in doctor lists their own future slots, booked and open, sorted by startTime ascending.
async function getMyAvailability(doctorId) {
  const now = new Date();
  const slots = await Slot.find({
    doctor: doctorId,
    startTime: { $gte: now },
  })
    .sort({ startTime: 1 })
    .lean();

  return {
    slots: slots.map((s) => ({
      id: s._id.toString(),
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      isBooked: s.isBooked,
    })),
  };
}

// PUT /api/v1/doctors/me/availability
// The logged-in doctor sets or updates their future availability slots.
// Replaces unbooked future slots with the validated list.
// Booked slots can never be removed or modified.
async function updateMyAvailability(doctorId, rawSlots) {
  const now = new Date();
  const validatedSlots = validateSlotsList(rawSlots, now);

  // Load existing future slots
  const existingFutureSlots = await Slot.find({
    doctor: doctorId,
    startTime: { $gte: now },
  });

  const bookedSlots = existingFutureSlots.filter((s) => s.isBooked);

  // Ensure no incoming slot overlaps with an already booked slot
  for (const slot of validatedSlots) {
    for (const booked of bookedSlots) {
      if (slot.startTime < booked.endTime && slot.endTime > booked.startTime) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Cannot add or modify a slot that overlaps with an already booked slot (${booked.startTime.toISOString()})`
        );
      }
    }
  }

  // Remove existing unbooked future slots for this doctor
  await Slot.deleteMany({
    doctor: doctorId,
    isBooked: false,
    startTime: { $gte: now },
  });

  // Insert the new validated slots
  if (validatedSlots.length > 0) {
    const docsToInsert = validatedSlots.map((s) => ({
      doctor: doctorId,
      startTime: s.startTime,
      endTime: s.endTime,
      isBooked: false,
    }));
    await Slot.insertMany(docsToInsert);
  }

  // Return all future slots (newly added open slots + preserved booked slots), sorted by startTime
  const allSlots = await Slot.find({
    doctor: doctorId,
    startTime: { $gte: now },
  })
    .sort({ startTime: 1 })
    .lean();

  return {
    slots: allSlots.map((s) => ({
      id: s._id.toString(),
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      isBooked: s.isBooked,
    })),
  };
}

// GET /api/v1/doctors/:id/availability
// A logged-in patient views one doctor's open future slots (not booked, sorted by startTime).
// Returns doctor's id, name, and open slots. Never exposes email, phone, or passwordHash.
async function getDoctorAvailability(doctorId) {
  if (!doctorId || typeof doctorId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(doctorId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid doctor ID');
  }

  // Doctor must exist, have role 'doctor', and be active
  const doctor = await Doctor.findOne({
    _id: doctorId,
    role: 'doctor',
    isActive: true,
  }).select('_id name');

  if (!doctor) {
    throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
  }

  const now = new Date();
  const openSlots = await Slot.find({
    doctor: doctorId,
    isBooked: false,
    startTime: { $gte: now },
  })
    .sort({ startTime: 1 })
    .lean();

  return {
    doctor: {
      id: doctor._id.toString(),
      name: doctor.name,
    },
    slots: openSlots.map((s) => ({
      id: s._id.toString(),
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      isBooked: s.isBooked,
    })),
  };
}

module.exports = {
  getDoctorAvailability,
  updateMyAvailability,
  getMyAvailability,
  listDoctors,
  escapeRegex,
  validateDoctorsQuery,
};
