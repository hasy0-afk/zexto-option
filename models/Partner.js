const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true, minlength: 6, select: false },
  partnerId: { type: String, unique: true },
  tier: { type: String, enum: ['Silver', 'Gold', 'Platinum'], default: 'Silver' },
  masterPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  referralCode: { type: String, unique: true },
  paymentMethod: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  accountHolderName: { type: String, default: '' },
  totalClicks: { type: Number, default: 0 },
  totalBalance: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

partnerSchema.pre('save', async function (next) {
  if (!this.partnerId) {
    const count = await mongoose.model('Partner').countDocuments();
    this.partnerId = 'ZXT-' + String(count + 1001).padStart(4, '0');
  }
  if (!this.referralCode) this.referralCode = this.partnerId;
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

partnerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

partnerSchema.methods.updateTier = async function () {
  const Referral = mongoose.model('Referral');
  const count = await Referral.countDocuments({ partner: this._id, status: 'active' });
  if (count >= 50) this.tier = 'Platinum';
  else if (count >= 11) this.tier = 'Gold';
  else this.tier = 'Silver';
  await this.save();
};

partnerSchema.methods.getCommissionRate = function () {
  const rates = { Silver: 3, Gold: 5, Platinum: 8 };
  return rates[this.tier] || 3;
};

module.exports = mongoose.model('Partner', partnerSchema);