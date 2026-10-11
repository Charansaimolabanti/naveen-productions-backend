const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema(
  {
    text: { type: String, default: '', trim: true },
    link: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const heroSlideSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Slide title is required'],
      trim: true,
    },
    subtitle: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    desktopImage: {
      type: String,
      required: [true, 'Desktop image is required'],
    },
    mobileImage: {
      type: String,
      default: '',
    },
    primaryButton: {
      type: buttonSchema,
      default: () => ({ text: '', link: '' }),
    },
    secondaryButton: {
      type: buttonSchema,
      default: () => ({ text: '', link: '' }),
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    autoplayDuration: {
      type: Number,
      default: 2000,
      min: [0, 'Autoplay duration must be 0 (off) or at least 1000ms'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure a maximum of 5 active slides when publishing
heroSlideSchema.methods.publishable = async function () {
  if (!this.isActive) return true;

  const activeCount = await mongoose.model('HeroSlide').countDocuments({
    isActive: true,
    _id: { $ne: this._id },
  });

  return activeCount < 5;
};

heroSlideSchema.pre('save', async function (next) {
  if (this.isModified('isActive') && this.isActive === true) {
    const activeCount = await mongoose.model('HeroSlide').countDocuments({
      isActive: true,
      _id: { $ne: this._id },
    });

    if (activeCount >= 5) {
      const error = new Error('You can have a maximum of 5 active hero slides.');
      error.code = 'MAX_ACTIVE_SLIDES';
      return next(error);
    }
  }
  next();
});

heroSlideSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate();
  const isActive = update.isActive;

  if (typeof isActive === 'boolean' && isActive === true) {
    const docId = this.getQuery()._id;
    const activeCount = await mongoose.model('HeroSlide').countDocuments({
      isActive: true,
      _id: { $ne: docId },
    });

    if (activeCount >= 5) {
      const error = new Error('You can have a maximum of 5 active hero slides.');
      error.code = 'MAX_ACTIVE_SLIDES';
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('HeroSlide', heroSlideSchema);