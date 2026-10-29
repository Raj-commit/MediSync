const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema(
  {
    diagnosis: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    notes: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

const medicalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    entries: [entrySchema],
  },
  {
    timestamps: true,
  }
);

// Enforce exactly one MedicalRecord document per patient (AGENTS.md section 5)
medicalRecordSchema.index({ patient: 1 }, { unique: true });

const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema);

module.exports = MedicalRecord;
