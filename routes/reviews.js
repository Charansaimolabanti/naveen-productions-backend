const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const { protect } = require('../middleware/auth');

const router = express.Router();

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/reviews - public: all reviews, newest first
router.get('/', async (req, res) => {
  try {
    const filter = {};

    if (req.query.featured === 'true' || req.query.featured === true) filter.featured = true;
    if (req.query.featured === 'false' || req.query.featured === false) filter.featured = false;

    const reviews = await Review.find(filter).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/reviews - admin: create review
router.post('/', protect, async (req, res) => {
  try {
    const review = await Review.create(req.body);

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/reviews/:id - admin: update review
router.put('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/reviews/:id - admin: delete review
router.delete('/:id', protect, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    res.json({ success: true, message: 'Review deleted', data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;