-- Ramree — sample seed data
-- Apply:  npx wrangler d1 execute ramree-db --remote --file=./seed.sql

DELETE FROM categories;
INSERT INTO categories (slug, name, subtitle, hero_image, sort_order) VALUES
  ('korean-tshirts',  'Korean T-Shirts', 'Soft, minimal, everyday',      '', 1),
  ('korean-tops',     'Korean Tops',     'Elevated casual silhouettes',  '', 2),
  ('rayon-kurti-sets','Rayon Kurti Sets','Flowy festive comfort',        '', 3);

DELETE FROM products;
INSERT INTO products (id, category, name, description, price, stock, images, created_at) VALUES
  ('kt-001','korean-tshirts','Oversized Cotton Tee','Breathable oversized fit in a muted tone.',799,12,
     '["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900"]', '2026-07-04T00:00:00Z'),
  ('kt-002','korean-tshirts','Ribbed Baby Tee','Fitted ribbed knit with a clean neckline.',699,8,
     '["https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=900"]', '2026-07-04T00:00:00Z'),
  ('ktop-001','korean-tops','Puff Sleeve Blouse','Romantic puff sleeves with a soft drape.',1299,6,
     '["https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=900"]', '2026-07-04T00:00:00Z'),
  ('ktop-002','korean-tops','Square Neck Top','Structured square neckline, tailored fit.',1149,10,
     '["https://images.unsplash.com/photo-1554568218-0f1715e72254?w=900"]', '2026-07-04T00:00:00Z'),
  ('rk-001','rayon-kurti-sets','Floral Rayon Kurti Set','Printed rayon kurti with matching pants.',1699,5,
     '["https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900"]', '2026-07-04T00:00:00Z'),
  ('rk-002','rayon-kurti-sets','Solid Rayon A-Line Set','A-line silhouette in a solid jewel tone.',1899,7,
     '["https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=900"]', '2026-07-04T00:00:00Z');
