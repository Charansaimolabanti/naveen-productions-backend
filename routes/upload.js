const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

// Multer memory storage - image buffers are compressed via Cloudinary
// (width 1920 limit, quality auto, webp) just like hero slides and products.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only JPG, PNG and WebP are allowed'), allowed.includes(file.mimetype));
  },
});

// POST /api/upload - admin: upload a single image, return its Cloudinary URL.
router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }
    const folder = req.body.folder || 'uploads';
    const url = await uploadToCloudinary(req.file, folder, 'img-' + Date.now());
    res.status(201).json({ success: true, url: url, data: { url: url } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;