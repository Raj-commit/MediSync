const mongoose = require("mongoose");

const aiAssessmentSchema = new mongoose.Schema(
  {
    assessment: {
      type: String,
      required: true,
      trim: true,
    },
    possibleConditions: {
      type: [String],
      default: [],
    },
    urgencyLevel: {
      type: String,
      enum: ["emergency", "urgent", "routine"],
      default: "routine",
      required: true,
    },
    suggestedSpecialisation: {
      type: String,
      default: "General Physician",
      required: true,
      trim: true,
    },
    generalAdvice: {
      type: [String],
      default: [],
    },
    disclaimer: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const symptomCheckResultSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    symptomsInput: {
      type: [String],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 1 && v.length <= 10;
        },
        message: "symptomsInput must contain between 1 and 10 symptoms",
      },
    },
    aiAssessment: {
      type: aiAssessmentSchema,
      required: true,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

// Compound index for querying patient history sorted newest first
symptomCheckResultSchema.index({ patient: 1, checkedAt: -1 });

const SymptomCheckResult = mongoose.model(
  "SymptomCheckResult",
  symptomCheckResultSchema,
);

module.exports = SymptomCheckResult;
