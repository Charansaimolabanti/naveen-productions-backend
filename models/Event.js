const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    shortDescription: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Event category is required'],
    },
    date: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    city: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      default: '',
    },
    coverImage: {
      type: String,
      required: [true, 'Cover image is required'],
    },
    template: {
      type: String,
      enum: ['editorial', 'showcase', 'behind-the-scenes'],
      default: 'editorial',
    },
    sections: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    relatedProducts: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
      ],
      default: [],
    },
    clientTestimonial: {
      quote: { type: String, default: '' },
      name: { type: String, default: '' },
      role: { type: String, default: '' },
    },
    published: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

eventSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = String(this.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);