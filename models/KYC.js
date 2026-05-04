const mongoose = require("mongoose");

const KYCSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,  // one KYC per user
    },
    fullName: String,
    dateOfBirth: Date,
    nationality: String,
    addressLine: String,
    city: String,
    country: String,
    postalCode: String,
    // Documents (in production you'd store file URLs from cloud storage)
    documents: [
      {
        type: { type: String }, // "passport", "id_card", "driving_license", "selfie", "proof_of_address"
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: String,
    reviewedBy: String,
    reviewedAt: Date,
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ✅ Idempotent pattern — prevents OverwriteModelError
module.exports = mongoose.models.KYC || mongoose.model("KYC", KYCSchema);
