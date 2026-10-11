/**
 * End-to-end smoke tests for the hero slides API using an in-memory MongoDB.
 * Run with: npm test
 *
 * Covers: model rules, public vs admin routes, JWT protection, create/update/
 * delete, reorder, and the maximum-5-active-slides business rule.
 */
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.MONGODB_URI = 'in-memory';
process.env.CLOUDINARY_CLOUD_NAME = 'fake';
process.env.CLOUDINARY_API_KEY = 'fake';
process.env.CLOUDINARY_API_SECRET = 'fake';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;
let server;
let baseUrl;
let token;

const HeroSlide = require('../models/HeroSlide');
const Admin = require('../models/Admin');
const heroSlidesRouter = require('../routes/heroSlides');
const authRouter = require('../routes/auth');

function slidePayload(overrides = {}) {
  return {
    title: 'TEST SLIDE HEADING',
    subtitle: 'NAVEEN PRODUCTIONS',
    description: 'Test description',
    desktopImage: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
    mobileImage: '',
    primaryButton: { text: 'Explore', link: '/rentals' },
    secondaryButton: { text: 'Contact', link: '/contact' },
    order: 0,
    isActive: true,
    autoplayDuration: 2000,
    ...overrides,
  };
}

async function api(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Seed an admin + token
  const admin = await Admin.create({
    name: 'Test Admin',
    email: 'admin@test.com',
    password: 'password123',
  });
  token = jwt.sign(
    { id: admin._id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/hero-slides', heroSlidesRouter);
  app.use('/api/auth', authRouter);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/hero-slides is public', async () => {
  const res = await api('GET', '/api/hero-slides');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
});

test('admin-only routes reject requests without a token', async () => {
  const res = await api('GET', '/api/hero-slides/all');
  assert.equal(res.status, 401);
});

test('POST creates a slide only for authenticated admin', async () => {
  const unauthorized = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'Nope' }),
  });
  assert.equal(unauthorized.status, 401);

  const res = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'WELCOME TO THE SHOW' }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.title, 'WELCOME TO THE SHOW');
  assert.equal(res.json.data.isActive, true);
});

test('public endpoint only returns published slides, sorted by order', async () => {
  await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'SECOND', order: 1 }),
    headers: { Authorization: `Bearer ${token}` },
  });
  await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'THIRD', order: 2 }),
    headers: { Authorization: `Bearer ${token}` },
  });
  await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'HIDDEN', order: 3, isActive: false }),
    headers: { Authorization: `Bearer ${token}` },
  });

  const pub = await api('GET', '/api/hero-slides');
  assert.equal(pub.json.count, 3);
  assert.deepEqual(
    pub.json.data.map((s) => s.title),
    ['WELCOME TO THE SHOW', 'SECOND', 'THIRD']
  );
  assert.ok(pub.json.data.every((s) => s.isActive));

  const all = await api('GET', '/api/hero-slides/all', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(all.json.count, 4);
});

test('enforces a maximum of 5 active hero slides', async () => {
  // 3 active already exist
  await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'FOUR', order: 4 }),
    headers: { Authorization: `Bearer ${token}` },
  });
  await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'FIVE', order: 5 }),
    headers: { Authorization: `Bearer ${token}` },
  });

  const sixth = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'SIXTH', order: 6, isActive: true }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(sixth.status, 400);
  assert.match(sixth.json.message, /maximum of 5/);

  // But a 6th unpublished slide is allowed
  const extra = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'DRAFT', order: 6, isActive: false }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(extra.status, 201);
});

test('cannot publish an inactive slide when 5 are already active', async () => {
  const draft = await HeroSlide.findOne({ title: 'DRAFT' });
  const res = await api('PUT', `/api/hero-slides/${draft._id}`, {
    body: { ...slidePayload({ title: 'DRAFT', order: 6 }), isActive: true },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /maximum of 5/);
});

test('autoplay duration can be turned OFF with 0 and defaults to 2000', async () => {
  const off = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'NO AUTOPLAY', autoplayDuration: 0, isActive: false }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(off.status, 201);
  assert.equal(off.json.data.autoplayDuration, 0);

  const defaulted = await api('POST', '/api/hero-slides', {
    body: slidePayload({ title: 'DEFAULT DURATION', isActive: false }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(defaulted.status, 201);
  assert.equal(defaulted.json.data.autoplayDuration, 2000);
});

test('PUT updates a slide and GET /:id returns it', async () => {
  const first = await HeroSlide.findOne({ title: 'WELCOME TO THE SHOW' });

  const updated = await api('PUT', `/api/hero-slides/${first._id}`, {
    body: slidePayload({ title: 'THE BIG TOUR', subtitle: 'LIVE' }),
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.title, 'THE BIG TOUR');

  const fetched = await api('GET', `/api/hero-slides/${first._id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.json.data.subtitle, 'LIVE');
});

test('PUT /reorder persists a new order', async () => {
  const slides = await HeroSlide.find().sort({ order: 1 }).lean();
  const ids = slides.map((s) => s._id.toString());
  const reversed = [...ids].reverse();

  const res = await api('PUT', '/api/hero-slides/reorder', {
    body: { orderedIds: reversed },
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);

  const dbOrder = (await HeroSlide.find().sort({ order: 1 }).lean()).map(
    (s) => s._id.toString()
  );
  assert.deepEqual(dbOrder, reversed);
});

test('DELETE removes a slide and re-sequences remaining orders', async () => {
  const before = await HeroSlide.find().sort({ order: 1 }).lean();
  const middle = before[2];

  const res = await api('DELETE', `/api/hero-slides/${middle._id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);

  const afterDel = await HeroSlide.find().sort({ order: 1 }).lean();
  assert.ok(!afterDel.some((s) => s._id.toString() === middle._id.toString()));
  assert.ok(
    afterDel.every((s, i) => s.order === i),
    'orders must be sequential 0..n'
  );
});

test('invalid IDs return 404, not 500', async () => {
  const res = await api('DELETE', '/api/hero-slides/not-a-valid-id', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
});

test('auth login issues a token for valid credentials', async () => {
  const ok = await api('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'password123' },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);

  const bad = await api('POST', '/api/auth/login', {
    body: { email: 'admin@test.com', password: 'wrong' },
  });
  assert.equal(bad.status, 401);
});