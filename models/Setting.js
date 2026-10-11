const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: 'NAVEEN PRODUCTIONS',
    },
    tagline: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    whatsappNumber: {
      type: String,
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },
    social: {
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      facebook: { type: String, default: '' },
    },
    mapQuery: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

settingSchema.pre('save', async function (next) {
  const Setting = mongoose.model('Setting');
  const existing = await Setting.findOne({ _id: { $ne: this._id } });
  if (existing) {
    const error = new Error('Only one settings document is allowed');
    return next(error);
  }
  next();
});

module.exports = mongoose.model('Setting', settingSchema);