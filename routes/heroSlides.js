const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const HeroSlide = require('../models/HeroSlide');
const cloudinary = require('../config/cloudinary');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Multer memory storage - images are buffered then streamed to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, JPEG, PNG and WebP images are allowed'), false);
    }
  },
});

// Cache image uploads to Cloudinary. Returns { secure_url } or null.
async function uploadToCloudinary(file, folder, publicIdBase) {
  if (!file) return null;

  const b64 = Buffer.from(file.buffer).toString('base64');
  const dataURI = `data:${file.mimetype};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataURI, {
    folder: `naveen-productions/${folder}`,
    public_id: `${publicIdBase}-${Date.now()}`,
    resource_type: 'image',
    transformation: [
      { width: 1920, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'webp' },
    ],
  });

  return result.secure_url;
}

// Normalize slide payload from the frontend
function normalizeSlide(body) {
  const primaryButton = body.primaryButton || {};
  const secondaryButton = body.secondaryButton || {};

  const slide = {
    title: body.title,
    subtitle: body.subtitle || '',
    description: body.description || '',
    primaryButton: {
      text: primaryButton.text || body.primaryButtonText || '',
      link: primaryButton.link || body.primaryButtonLink || '',
    },
    secondaryButton: {
      text: secondaryButton.text || body.secondaryButtonText || '',
      link: secondaryButton.link || body.secondaryButtonLink || '',
    },
    order: body.order !== undefined ? Number(body.order) : 0,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    autoplayDuration:
      body.autoplayDuration !== undefined &&
      body.autoplayDuration !== null &&
      body.autoplayDuration !== ''
        ? Number(body.autoplayDuration)
        : 2000,
    desktopImage: body.desktopImage || '',
    mobileImage: body.mobileImage || '',
  };

  Object.keys(slide).forEach((key) => {
    if (slide[key] === undefined) delete slide[key];
  });

  return slide;
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ============================================================
// Public routes
// ============================================================

// GET /api/hero-slides - public: only active slides, ordered
router.get('/', async (req, res) => {
  try {
    const slides = await HeroSlide.find({ isActive: true })
      .sort({ order: 1 })
      .lean();

    res.json({
      success: true,
      count: slides.length,
      data: slides,
    });
  } catch (error) {
    console.error('GET /api/hero-slides error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching hero slides' });
  }
});

// GET /api/hero-slides/all - admin: all slides (incl. unpublished)
router.get('/all', protect, async (req, res) => {
  try {
    const slides = await HeroSlide.find().sort({ order: 1 }).lean();

    res.json({
      success: true,
      count: slides.length,
      data: slides,
    });
  } catch (error) {
    console.error('GET /api/hero-slides/all error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching hero slides' });
  }
});

// ============================================================
// Admin routes (JWT protected)
// ============================================================

// PUT /api/hero-slides/reorder - reorder slides
// body: { orderedIds: ["id1", "id2", ...] }
// Declared BEFORE /:id routes so "reorder" is not captured by :id
router.put('/reorder', protect, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedIds array is required' });
    }

    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));

    await HeroSlide.bulkWrite(bulkOps);

    const slides = await HeroSlide.find().sort({ order: 1 }).lean();

    res.json({ success: true, message: 'Hero slides reordered', data: slides });
  } catch (error) {
    console.error('PUT /api/hero-slides/reorder error:', error);
    res.status(500).json({ success: false, message: 'Server error reordering hero slides' });
  }
});

// POST /api/hero-slides - create
router.post('/', protect, upload.fields([
  { name: 'desktopImage', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
]), async (req, res) => {
  try {
    const body = parseBody(req.body);
    const slideData = normalizeSlide(body);

    if (slideData.isActive) {
      const activeCount = await HeroSlide.countDocuments({ isActive: true });

      if (activeCount >= 5) {
        return res.status(400).json({
          success: false,
          message: 'You can have a maximum of 5 active hero slides.',
        });
      }
    }

    if (req.files && req.files.desktopImage && req.files.desktopImage[0]) {
      slideData.desktopImage = await uploadToCloudinary(
        req.files.desktopImage[0],
        'hero-slides',
        slugify(slideData.title || 'slide')
      );
    }
    if (req.files && req.files.mobileImage && req.files.mobileImage[0]) {
      slideData.mobileImage = await uploadToCloudinary(
        req.files.mobileImage[0],
        'hero-slides-mobile',
        slugify(slideData.title || 'slide') + '-mobile'
      );
    }

    if (!slideData.desktopImage) {
      return res.status(400).json({
        success: false,
        message: 'Desktop image is required',
      });
    }

    // If no explicit order, append to the end of the list
    const lastSlide = await HeroSlide.findOne().sort({ order: -1 }).lean();
    slideData.order = (lastSlide ? lastSlide.order : -1) + 1;

    const slide = await HeroSlide.create(slideData);

    res.status(201).json({ success: true, data: slide });
  } catch (error) {
    console.error('POST /api/hero-slides error:', error);

    if (error.code === 'MAX_ACTIVE_SLIDES') {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: error.message || 'Server error creating hero slide' });
  }
});

// GET /api/hero-slides/:id - admin: single slide (any status)
router.get('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    const slide = await HeroSlide.findById(req.params.id).lean();

    if (!slide) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    res.json({ success: true, data: slide });
  } catch (error) {
    console.error(`GET /api/hero-slides/${req.params.id} error:`, error);
    res.status(500).json({ success: false, message: 'Server error fetching hero slide' });
  }
});

// PUT /api/hero-slides/:id - update
router.put('/:id', protect, upload.fields([
  { name: 'desktopImage', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    const existing = await HeroSlide.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    const body = parseBody(req.body);
    const slideData = normalizeSlide(body);

    if (slideData.isActive && !existing.isActive) {
      const activeCount = await HeroSlide.countDocuments({
        isActive: true,
        _id: { $ne: req.params.id },
      });

      if (activeCount >= 5) {
        return res.status(400).json({
          success: false,
          message: 'You can have a maximum of 5 active hero slides.',
        });
      }
    }

    if (req.files && req.files.desktopImage && req.files.desktopImage[0]) {
      slideData.desktopImage = await uploadToCloudinary(
        req.files.desktopImage[0],
        'hero-slides',
        slugify(slideData.title || 'slide')
      );
    }
    if (req.files && req.files.mobileImage && req.files.mobileImage[0]) {
      slideData.mobileImage = await uploadToCloudinary(
        req.files.mobileImage[0],
        'hero-slides-mobile',
        slugify(slideData.title || 'slide') + '-mobile'
      );
    }

    // Allow admin to explicitly clear the mobile image
    if (body.removeMobileImage === true) {
      slideData.mobileImage = '';
    }

    const slide = await HeroSlide.findByIdAndUpdate(
      req.params.id,
      slideData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: slide });
  } catch (error) {
    console.error(`PUT /api/hero-slides/${req.params.id} error:`, error);

    if (error.code === 'MAX_ACTIVE_SLIDES') {
      return res.status(400).json({ success: false, message: error.message });
    }

    res.status(500).json({ success: false, message: error.message || 'Server error updating hero slide' });
  }
});

// DELETE /api/hero-slides/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    const slide = await HeroSlide.findByIdAndDelete(req.params.id);

    if (!slide) {
      return res.status(404).json({ success: false, message: 'Hero slide not found' });
    }

    // Re-sequence remaining slides so there are no gaps in the order
    const remaining = await HeroSlide.find().sort({ order: 1 }).lean();
    await Promise.all(
      remaining.map((s, index) =>
        HeroSlide.findByIdAndUpdate(s._id, { order: index })
      )
    );

    // Best-effort cleanup of Cloudinary images
    try {
      const publicIds = [];
      if (slide.desktopImage) publicIds.push(extractPublicId(slide.desktopImage));
      if (slide.mobileImage) publicIds.push(extractPublicId(slide.mobileImage));
      if (publicIds.length) await cloudinary.api.delete_resources(publicIds);
    } catch (cloudErr) {
      console.warn('Cloudinary cleanup warning:', cloudErr.message);
    }

    res.json({ success: true, message: 'Hero slide deleted', data: slide });
  } catch (error) {
    console.error(`DELETE /api/hero-slides/${req.params.id} error:`, error);
    res.status(500).json({ success: false, message: 'Server error deleting hero slide' });
  }
});

// Helpers
function parseBody(body) {
  // Multipart submissions wrap fields in a JSON string under `json`,
  // while plain JSON requests send the object directly.
  return typeof body?.json === 'string' ? JSON.parse(body.json) : body || {};
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'slide';
}

function extractPublicId(url) {
  try {
    const parts = new URL(url).pathname.split('/');
    const last = parts[parts.length - 1];
    return decodeURIComponent(last.replace(/\.[^.]+$/, ''));
  } catch {
    return null;
  }
}

module.exports = router;