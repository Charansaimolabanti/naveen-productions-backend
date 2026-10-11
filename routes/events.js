const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Event = require('../models/Event');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG and WebP images are allowed'), allowed.includes(file.mimetype));
  },
});

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function parseBody(body) {
  return typeof body?.json === 'string' ? JSON.parse(body.json) : body || {};
}

function setPath(object, path, value) {
  const parts = path.split('.');
  let target = object;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) target[part] = value;
    else target = target[part];
  });
}

async function applyImageUploads(data, files) {
  const slots = data.uploadSlots || [];
  for (let index = 0; index < slots.length; index += 1) {
    const file = files?.[index];
    if (!file) continue;
    const url = await uploadToCloudinary(file, 'events', `event-${Date.now()}-${index}`);
    setPath(data, slots[index], url);
  }
  delete data.uploadSlots;
  return data;
}

// GET /api/events - public: published events, date desc
router.get('/', async (req, res) => {
  try {
    const { category, limit } = req.query;

    const filter = { published: true };

    if (category) filter.category = category;

    let query = Event.find(filter).sort({ date: -1 });

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (parsedLimit > 0) query = query.limit(parsedLimit);
    }

    const events = await query.lean();

    res.json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/events/all - admin: all events (published + draft), date desc
router.get('/all', protect, async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 }).lean();

    res.json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/events/:slugOrId - public: get by slug first, fallback to ID
router.get('/:slugOrId', async (req, res) => {
  try {
    const { slugOrId } = req.params;

    let event = await Event.findOne({ slug: slugOrId })
      .populate('relatedProducts', 'name slug dayRate hourlyRate images')
      .lean();

    if (!event && isValidId(slugOrId)) {
      event = await Event.findById(slugOrId)
        .populate('relatedProducts', 'name slug dayRate hourlyRate images')
        .lean();
    }

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/events - admin: create event (auto-slug from title)
router.post('/', protect, upload.array('images', 30), async (req, res) => {
  try {
    const data = await applyImageUploads(parseBody(req.body), req.files);
    const event = await Event.create(data);

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/events/:id - admin: update event
router.put('/:id', protect, upload.array('images', 30), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const data = await applyImageUploads(parseBody(req.body), req.files);
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/events/:id - admin: delete event
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, message: 'Event deleted', data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;