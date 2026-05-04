const mongoose = require("mongoose");

const TournamentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: String,
    icon: {
      type: String,
      default: "🏆",
    },
    prize: {
      type: Number,
      required: true, // total prize pool in USD
    },
    entryFee: {
      type: Number,
      default: 0,
    },
    maxParticipants: {
      type: Number,
      default: 1000,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "live", "ended"],
      default: "upcoming",
    },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        joinedAt: { type: Date, default: Date.now },
        pnl: { type: Number, default: 0 },
        trades: { type: Number, default: 0 },
      },
    ],
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    prizeDistributed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Virtual: current participant count
TournamentSchema.virtual("participantCount").get(function () {
  return this.participants.length;
});

// Auto-update status based on dates
TournamentSchema.methods.refreshStatus = function () {
  const now = Date.now();
  if (now < this.startsAt) this.status = "upcoming";
  else if (now >= this.startsAt && now < this.endsAt) this.status = "live";
  else this.status = "ended";
  return this.status;
};

module.exports = mongoose.model("Tournament", TournamentSchema);
