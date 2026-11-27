const assert = require('assert');
const fs = require('fs');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
for (const [id, price] of [['PROD-CHAM-101',15950],['PROD-FERR-001',58500]]) {
  const html = fs.readFileSync('products/' + id + '/index.html', 'utf8');
  const url = 'https://dver1.com/products/' + id + '/';
  assert.strictEqual((html.match(/rel="canonical"/g) || []).length, 1);
  assert(html.includes('href="' + url + '"'));
  assert.strictEqual((html.match(/name="description"/g) || []).length, 1);
  assert.strictEqual((html.match(/id="productJsonLd"/g) || []).length, 1);
  assert(!html.includes('Загрузка модели...'));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json" id="productJsonLd">([\s\S]*?)<\/script>/)[1]);
  assert.strictEqual(schema.sku, id);
  assert.strictEqual(schema.offers.url, url);
  assert.strictEqual(schema.offers.price, price);
  assert(!schema.offers.availability);
  assert(fs.existsSync(schema.image[0].replace('https://dver1.com/', '')));
  assert(sitemap.includes('<loc>' + url + '</loc>'));
}
console.log('SEO: исходный HTML, canonical, JSON-LD, изображения и sitemap двух моделей проверены.');
