const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    isBooked: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring a doctor can never have two slots with the same start time.
slotSchema.index({ doctor: 1, startTime: 1 }, { unique: true });

const Slot = mongoose.model('Slot', slotSchema);

module.exports = Slot;
