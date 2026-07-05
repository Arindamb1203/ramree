-- Ramree — sample seed data
-- Apply:  npx wrangler d1 execute ramree-db --remote --file=./seed.sql

DELETE FROM categories;
INSERT INTO categories (slug, name, subtitle, hero_image, sort_order) VALUES
  ('korean-tshirts',  'Korean T-Shirts', 'Soft, minimal, everyday',      '', 1),
  ('korean-tops',     'Korean Tops',     'Elevated casual silhouettes',  '', 2),
  ('rayon-kurti-sets','Rayon Kurti Sets','Flowy festive comfort',        '', 3);

DELETE FROM products;
INSERT INTO products (id, category, name, description, price, cost, stock, colors, sizes, rating, review_count, images, created_at) VALUES
  ('kt-001','korean-tshirts','Oversized Cotton Tee','Breathable oversized fit in a muted tone.',799,400,12,
     '["Beige","Black"]','["S","M","L","XL"]',4.5,128,
     '["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900"]', '2026-07-04T00:00:00Z'),
  ('kt-002','korean-tshirts','Ribbed Baby Tee','Fitted ribbed knit with a clean neckline.',699,350,8,
     '["White","Pink"]','["S","M","L"]',4.2,86,
     '["https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=900"]', '2026-07-04T00:00:00Z'),
  ('ktop-001','korean-tops','Puff Sleeve Blouse','Romantic puff sleeves with a soft drape.',1299,600,6,
     '["Ivory","Sage"]','["S","M","L","XL"]',4.7,203,
     '["https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=900"]', '2026-07-04T00:00:00Z'),
  ('ktop-002','korean-tops','Square Neck Top','Structured square neckline, tailored fit.',1149,550,10,
     '["Black","Rust"]','["S","M","L"]',4.1,54,
     '["https://images.unsplash.com/photo-1554568218-0f1715e72254?w=900"]', '2026-07-04T00:00:00Z'),
  ('rk-001','rayon-kurti-sets','Floral Rayon Kurti Set','Printed rayon kurti with matching pants.',1699,800,5,
     '["Teal","Maroon"]','["M","L","XL","XXL"]',4.6,176,
     '["https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900"]', '2026-07-04T00:00:00Z'),
  ('rk-002','rayon-kurti-sets','Solid Rayon A-Line Set','A-line silhouette in a solid jewel tone.',1899,900,7,
     '["Mustard","Green"]','["S","M","L","XL"]',4.4,97,
     '["https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=900"]', '2026-07-04T00:00:00Z');
