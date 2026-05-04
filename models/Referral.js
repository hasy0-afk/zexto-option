const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  clientName: { type: String, required: true },
  clientEmail: { type: String, required: true },
  clientUserId: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'active', 'inactive'], default: 'pending' },
  totalDeposits: { type: Number, default: 0 },
  totalCommissionGenerated: { type: Number, default: 0 },
  source: { type: String, default: 'direct' },
  campaignName: { type: String, default: '' },
}, { timestamps: true });

referralSchema.index({ partner: 1, status: 1 });
module.exports = mongoose.model('Referral', referralSchema);