const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

// Multer memory storage - image buffers are compressed via Cloudinary.
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

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Parse a mixed multipart/JSON request body. Multipart submissions wrap the
// product fields as a JSON string under `json`; plain JSON arrives directly.
function parseBody(body) {
  return typeof body?.json === 'string' ? JSON.parse(body.json) : body || {};
}

async function uploadImages(files, slug, existing = []) {
  if (!files || !files.length) return existing;
  const uploaded = [];
  for (const file of files) {
    const url = await uploadToCloudinary(file, 'products', `${slug}-${Date.now()}`);
    uploaded.push({ url, alt: '' });
  }
  return [...existing, ...uploaded];
}

async function uploadReplacementImages(files, slug) {
  if (!files || !files.length) return [];
  const uploaded = [];
  for (const file of files) {
    const url = await uploadToCloudinary(file, 'products', `${slug}-${Date.now()}`);
    uploaded.push({ url, alt: '' });
  }
  return uploaded;
}

// GET /api/products/featured - public: featured products
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 6;

    const products = await Product.find({ featured: true })
      .limit(limit)
      .populate('category', 'name slug')
      .lean();

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products - public: list products with filters
router.get('/', async (req, res) => {
  try {
    const { category, featured, inStock, sort, limit } = req.query;

    const filter = {};

    if (category) filter.category = category;
    if (featured === 'true' || featured === true) filter.featured = true;
    if (featured === 'false' || featured === false) filter.featured = false;
    if (inStock === 'true' || inStock === true) filter.inStock = true;
    if (inStock === 'false' || inStock === false) filter.inStock = false;

    const allowedSorts = ['dayRate', '-dayRate', 'hourlyRate', '-hourlyRate', 'name', '-name', 'createdAt', '-createdAt'];

    let query = Product.find(filter).populate('category', 'name slug');

    if (allowedSorts.includes(sort)) {
      query = query.sort(sort);
    } else {
      query = query.sort('-createdAt');
    }

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (parsedLimit > 0) query = query.limit(parsedLimit);
    }

    const products = await query.lean();

    res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/:id - public: get product by ID
router.get('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .lean();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/products - admin: create product (multipart w/ optional images)
router.post('/', protect, upload.array('images', 10), async (req, res) => {
  try {
    const data = parseBody(req.body);
    const product = await Product.create({
      ...data,
      images: await uploadImages(
        req.files,
        data.slug || req.params.slug || 'product',
        (data.images || []).map((i) => (typeof i === 'string' ? { url: i } : i))
      ),
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/products/:id - admin: update product
router.put('/:id', protect, upload.array('images', 10), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const data = parseBody(req.body);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        ...data,
        images: await uploadImages(
          req.files,
          data.slug || 'product',
          (data.images || []).map((i) => (typeof i === 'string' ? { url: i } : i))
        ),
      },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/products/:id - admin: delete product
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, message: 'Product deleted', data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;