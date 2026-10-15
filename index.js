const express = require('express');
const app = express();

// ====== CONFIG: guesses where the question paper photo was cut off ======
const CONFIG = {
  categories: ['Starter', 'MainCourse', 'Dessert', 'Beverage', 'Snack'], // list was cut off after Dessert
  dishName: { min: 3, max: 60 },
  restaurant: { min: 2, max: 40 },
  defaultPage: 1,
  defaultLimit: 10,
  maxLimit: 100,
  statusCreate: 201,
  statusDelete: 204,
};
// =========================================================================

let dishes = [];
let nextId = 1;

app.use(express.json());

const bad = (res, msg) => res.status(400).json({ error: msg });
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Validate fields. partial=true: only validate fields present (PATCH).
function validate(body, partial) {
  const out = {};
  const need = (k) => !partial || k in body;

  if (need('dishName')) {
    if (!isStr(body.dishName)) return { error: 'dishName must be a string' };
    const v = body.dishName.trim();
    if (v.length < CONFIG.dishName.min || v.length > CONFIG.dishName.max)
      return { error: `dishName must be ${CONFIG.dishName.min} to ${CONFIG.dishName.max} characters` };
    out.dishName = v;
  }
  if (need('restaurant')) {
    if (!isStr(body.restaurant)) return { error: 'restaurant must be a string' };
    const v = body.restaurant.trim();
    if (v.length < CONFIG.restaurant.min || v.length > CONFIG.restaurant.max)
      return { error: `restaurant must be ${CONFIG.restaurant.min} to ${CONFIG.restaurant.max} characters` };
    out.restaurant = v;
  }
  if (need('category')) {
    if (!isStr(body.category) || !CONFIG.categories.includes(body.category))
      return { error: `category must be one of: ${CONFIG.categories.join(', ')}` };
    out.category = body.category;
  }
  if (need('isVegetarian')) {
    if (typeof body.isVegetarian !== 'boolean') return { error: 'isVegetarian must be a boolean' };
    out.isVegetarian = body.isVegetarian;
  }
  if (need('price')) {
    if (!isNum(body.price) || body.price < 0) return { error: 'price must be a non-negative number' };
    out.price = body.price;
  }
  return { value: out };
}

const isObj = (b) => b && typeof b === 'object' && !Array.isArray(b);
const find = (id) => dishes.find((d) => String(d.id) === String(id));

// POST /api/dishes
app.post('/api/dishes', (req, res) => {
  if (!isObj(req.body)) return bad(res, 'Body must be a JSON object');
  const r = validate(req.body, false);
  if (r.error) return bad(res, r.error);
  const dish = { id: nextId++, ...r.value };
  dishes.push(dish);
  res.status(CONFIG.statusCreate).json(dish);
});

// GET /api/dishes
app.get('/api/dishes', (req, res) => {
  const q = req.query;
  let page = CONFIG.defaultPage, limit = CONFIG.defaultLimit;

  if (q.page !== undefined) {
    page = Number(q.page);
    if (!Number.isInteger(page) || page < 1) return bad(res, 'page must be a positive integer');
  }
  if (q.limit !== undefined) {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > CONFIG.maxLimit)
      return bad(res, `limit must be an integer from 1 to ${CONFIG.maxLimit}`);
  }

  let list = dishes.slice();

  if (q.search !== undefined) {
    const s = String(q.search).trim().toLowerCase();
    if (s) list = list.filter((d) => d.dishName.toLowerCase().includes(s) || d.restaurant.toLowerCase().includes(s));
  }
  if (q.category !== undefined) {
    if (!CONFIG.categories.includes(q.category)) return bad(res, 'invalid category');
    list = list.filter((d) => d.category === q.category);
  }
  if (q.isVegetarian !== undefined) {
    if (q.isVegetarian !== 'true' && q.isVegetarian !== 'false') return bad(res, 'isVegetarian must be true or false');
    const want = q.isVegetarian === 'true';
    list = list.filter((d) => d.isVegetarian === want);
  }
  if (q.minPrice !== undefined) {
    const n = Number(q.minPrice);
    if (q.minPrice === '' || !Number.isFinite(n)) return bad(res, 'minPrice must be a number');
    list = list.filter((d) => d.price >= n);
  }
  if (q.maxPrice !== undefined) {
    const n = Number(q.maxPrice);
    if (q.maxPrice === '' || !Number.isFinite(n)) return bad(res, 'maxPrice must be a number');
    list = list.filter((d) => d.price <= n);
  }
  if (q.sortBy !== undefined) {
    if (!['dishName', 'price'].includes(q.sortBy)) return bad(res, 'sortBy must be dishName or price');
    const dir = q.order === 'desc' ? -1 : 1;
    if (q.order !== undefined && !['asc', 'desc'].includes(q.order)) return bad(res, 'order must be asc or desc');
    list.sort((a, b) => {
      const x = a[q.sortBy], y = b[q.sortBy];
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c * dir;
    });
  }

  const total = list.length;
  const start = (page - 1) * limit;
  res.status(200).json({
    data: list.slice(start, start + limit),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/dishes/:id
app.get('/api/dishes/:id', (req, res) => {
  const d = find(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dish not found' });
  res.status(200).json(d);
});

// PUT /api/dishes/:id  (replace all fields; id never changes)
app.put('/api/dishes/:id', (req, res) => {
  const d = find(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dish not found' });
  if (!isObj(req.body)) return bad(res, 'Body must be a JSON object');
  const r = validate(req.body, false);
  if (r.error) return bad(res, r.error);
  const updated = { id: d.id, ...r.value };
  dishes[dishes.indexOf(d)] = updated;
  res.status(200).json(updated);
});

// PATCH /api/dishes/:id  (at least one field; {} is 400)
app.patch('/api/dishes/:id', (req, res) => {
  const d = find(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dish not found' });
  if (!isObj(req.body)) return bad(res, 'Body must be a JSON object');
  const fields = ['dishName', 'restaurant', 'category', 'isVegetarian', 'price'];
  if (!fields.some((k) => k in req.body)) return bad(res, 'Provide at least one field to update');
  const r = validate(req.body, true);
  if (r.error) return bad(res, r.error);
  Object.assign(d, r.value); // id untouched
  res.status(200).json(d);
});

// DELETE /api/dishes/:id
app.delete('/api/dishes/:id', (req, res) => {
  const d = find(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dish not found' });
  dishes.splice(dishes.indexOf(d), 1);
  res.status(CONFIG.statusDelete).send();
});

// Malformed JSON and fallbacks
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return bad(res, 'Invalid JSON');
  res.status(500).json({ error: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
