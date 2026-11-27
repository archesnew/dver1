// Генерация самостоятельных статических страниц из шаблона и каталога.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog-output/products.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'product.html'), 'utf8');
const output = path.join(root, 'products');
const indexById = new Map(JSON.parse(fs.readFileSync(path.join(root, 'data/catalog-index.json'), 'utf8')).map(p => [p.id, p]));
fs.mkdirSync(output, { recursive: true });
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const raw of products) {
  const itemPath = path.join(root, 'data/products', raw.id + '.json');
  const p = fs.existsSync(itemPath) ? JSON.parse(fs.readFileSync(itemPath, 'utf8')) : raw;
  if (!/^PROD-[A-Z0-9-]+$/.test(p.id)) throw Error('Invalid product id: ' + p.id);
  const url = 'https://dver1.com/products/' + encodeURIComponent(p.id) + '/';
  const name = [p.brand, p.model || p.name].filter(Boolean).join(' ');
  const title = name + ' — Двери №1 Showroom';
  const desc = (p.description || name).slice(0, 160);
  const imagePath = p.images?.[0] || indexById.get(p.id)?.thumb;
  const image = imagePath ? new URL(imagePath, 'https://dver1.com/').href : '';
  const price = Number(p.category === 'Входные двери' ? p.price : p.leaf_price);
  const schema = { '@context': 'https://schema.org/', '@type': 'Product', name, description: p.description || '', sku: p.id, brand: { '@type': 'Brand', name: p.brand || 'Двери №1' } };
  if (image) schema.image = [image];
  if (price > 0) schema.offers = { '@type': 'Offer', url, priceCurrency: 'RUB', price };
  let html = template.replace('<head>', '<head>\n  <base href="/">')
    .replace('<body class="pdp-body">', '<body class="pdp-body" data-product-id="' + esc(p.id) + '">')
    .replace(/<title id="pdpMetaTitle">[\s\S]*?<\/title>/, '<title id="pdpMetaTitle">' + esc(title) + '</title>')
    .replace(/<meta name="description" id="pdpMetaDesc"[^>]*>/, '<meta name="description" id="pdpMetaDesc" content="' + esc(desc) + '">\n  <link rel="canonical" id="pdpCanonical" href="' + url + '">')
    .replace(/<script type="application\/ld\+json" id="productJsonLd">[\s\S]*?<\/script>/, '<script type="application/ld+json" id="productJsonLd">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>')
    .replace(/<h1 class="pdp-model-title" id="pdpModelTitle">[\s\S]*?<\/h1>/, '<h1 class="pdp-model-title" id="pdpModelTitle">' + esc(p.model || p.name) + '</h1>')
    .replace(/<p class="pdp-lead-description" id="pdpLeadDesc">[\s\S]*?<\/p>/, '<p class="pdp-lead-description" id="pdpLeadDesc">' + esc(p.description || '') + '</p>')
    .replace(/<span class="pdp-price-amount" id="pdpPriceAmount">[\s\S]*?<\/span>/, '<span class="pdp-price-amount" id="pdpPriceAmount">' + (price > 0 ? new Intl.NumberFormat('ru-RU').format(price) + ' ₽' : 'Уточнить цену') + '</span>');
  for (const [id, value] of Object.entries({pdpOgTitle:title,pdpMetaDescOg:desc,pdpOgImage:image,pdpOgUrl:url,pdpTwTitle:title,pdpTwDesc:desc,pdpTwImage:image})) {
    html = html.replace(new RegExp('(<meta [^>]*id="' + id + '" content=")[^"]*(")'), '$1' + esc(value).replace(/\$/g, '$$$$') + '$2');
  }
  const dir = path.join(output, p.id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
console.log('Создано страниц товаров: ' + products.length);
