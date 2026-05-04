const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  referral: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral', default: null },
  type: { type: String, enum: ['CPA', 'RevShare', 'SubAffiliate'], required: true },
  amount: { type: Number, required: true },
  rate: { type: Number, required: true },
  depositAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected'], default: 'pending' },
  description: { type: String, default: '' },
  sourcePartner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
}, { timestamps: true });

commissionSchema.index({ partner: 1, createdAt: -1 });
module.exports = mongoose.model('Commission', commissionSchema);