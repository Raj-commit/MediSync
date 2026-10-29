const mongoose = require('mongoose');

const videoSessionSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true,
      index: true,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    endedReason: {
      type: String,
      enum: ['call_ended', 'disconnected', 'completed', 'cancelled', null],
      default: null,
    },
    isExplicitlyEnded: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const VideoSession = mongoose.model('VideoSession', videoSessionSchema);

module.exports = VideoSession;
