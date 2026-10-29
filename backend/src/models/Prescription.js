const mongoose = require("mongoose");

const prescriptionItemSchema = new mongoose.Schema(
  {
    medicine: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    dosage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    instructions: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    issuedDate: {
      type: String,
      required: true,
    },
    items: {
      type: [prescriptionItemSchema],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length >= 1 && v.length <= 50;
        },
        message: "Prescription must contain between 1 and 50 items",
      },
    },
    pdfUrl: {
      type: String,
      required: true,
    },
    pdfStatus: {
      type: String,
      enum: ["ready", "pending", "failed"],
      default: "pending",
      required: true,
    },
    pdfData: {
      type: Buffer,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

// Enforce unique prescription per appointment (AGENTS.md section 5: 0..1 per appointment)
prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ doctor: 1, createdAt: -1 });

const Prescription = mongoose.model("Prescription", prescriptionSchema);

module.exports = Prescription;
