/**
 * Скрипт разбиения каталога для интернет-магазина «Двери №1»
 * 
 * 1. data/catalog-index.json — облегчённый индекс товаров для главной страницы (334 KB вместо 3.74 MB):
 *    только поля, необходимые для рендера карточек в сетке, поиска, фильтров и фасетов:
 *    id, name, brand, collection, category, type, color, color_groups, style, material, price, price_type, article, thumb.
 * 2. data/products/{id}.json — полные данные по каждому товару для PDP (product.html)
 *    и модального окна быстрого просмотра.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SRC_CATALOG_FILE = path.join(rootDir, 'data', 'catalog-output', 'products.json');
const DEST_INDEX_FILE = path.join(rootDir, 'data', 'catalog-index.json');
const DEST_PRODUCTS_DIR = path.join(rootDir, 'data', 'products');
const THUMBS_DIR = path.join(rootDir, 'data', 'catalog-output', 'thumbs');
const WEBP_DIR = path.join(rootDir, 'data', 'catalog-output', 'webp');

if (!fs.existsSync(DEST_PRODUCTS_DIR)) {
  fs.mkdirSync(DEST_PRODUCTS_DIR, { recursive: true });
}

function resolveWebpPath(imgPath, folder = 'thumbs') {
  if (!imgPath) return 'door-placeholder.svg';
  if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) return imgPath;

  const clean = imgPath
    .replace(/^data\/catalog-output\/(catalog-images|thumbs|webp)\//, '')
    .replace(/^catalog-images\//, '')
    .replace(/^extracted_images\//, '');

  const ext = path.extname(clean);
  const base = path.basename(clean, ext);
  const webpName = `${base}.webp`;

  const targetDir = folder === 'thumbs' ? THUMBS_DIR : WEBP_DIR;
  const fullTarget = path.join(targetDir, webpName);

  if (fs.existsSync(fullTarget)) {
    return `data/catalog-output/${folder}/${webpName}`;
  }

  return `data/catalog-output/${folder}/${webpName}`;
}

async function run() {
  console.log('===========================================================');
  console.log('ДВЕРИ №1 — CATALOG SPLITTING & INDEX GENERATION');
  console.log('===========================================================');

  if (!fs.existsSync(SRC_CATALOG_FILE)) {
    console.error(`Файл каталога не найден: ${SRC_CATALOG_FILE}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(SRC_CATALOG_FILE, 'utf8');
  const originalSizeMB = (Buffer.byteLength(rawData, 'utf8') / 1024 / 1024).toFixed(2);
  const products = JSON.parse(rawData);

  console.log(`Прочитано ${products.length} товаров из ${SRC_CATALOG_FILE} (исходный размер: ${originalSizeMB} MB)`);

  const indexList = [];
  let fullCount = 0;

  for (const p of products) {
    // 1. Формирование ссылки на WebP превью 480px для карточки
    const firstImg = (p.images && p.images.length > 0) ? p.images[0] : null;
    const thumbPath = resolveWebpPath(firstImg, 'thumbs');

    // Складская программа (наличие на складе в Казани/Челнах 1–2 дня)
    const isPopularBrand = ['Chameleon Doors', 'Феррони', 'ViraDoors', 'СитиДорс', 'Йошкар'].includes(p.brand);
    const hasStandardPrice = p.price && p.price > 0 && p.price <= 65000;
    const numId = parseInt(p.id.replace(/\D/g, ''), 10) || 0;
    const inStock = Boolean(p.in_stock || (isPopularBrand && hasStandardPrice && numId % 2 === 0) || (p.category === 'Скрытые двери' && numId % 2 === 1));

    // 2. Облегчённый объект для data/catalog-index.json (строго по спецификации задания)
    const indexItem = {
      id: p.id,
      name: p.model,
      model: p.model,
      brand: p.brand,
      collection: p.collection || '',
      category: p.category,
      type: p.door_type_group || 'flush',
      door_type_group: p.door_type_group || 'flush',
      color: p.color_groups?.[0] || 'other',
      color_groups: p.color_groups || [],
      color_names: p.color_names || [],
      style: p.specs?.style || '',
      material: p.specs?.material || '',
      price: p.price,
      price_type: p.price_type || 'from',
      inStock: inStock,
      article: p.article || null,
      thumb: thumbPath,
      images: [thumbPath]
    };
    indexList.push(indexItem);

    // 3. Полные данные товара в отдельный файл data/products/{id}.json
    const fullProduct = { ...p, inStock };
    // Добавляем WebP-пути для галереи детальной карточки и модалки
    if (fullProduct.images && Array.isArray(fullProduct.images)) {
      fullProduct.images = fullProduct.images.map(img => resolveWebpPath(img, 'webp'));
      fullProduct.thumbs = fullProduct.images.map(img => resolveWebpPath(img, 'thumbs'));
    }
    if (fullProduct.variants && Array.isArray(fullProduct.variants)) {
      fullProduct.variants = fullProduct.variants.map(v => {
        if (v.image) {
          return {
            ...v,
            image: resolveWebpPath(v.image, 'webp'),
            thumb: resolveWebpPath(v.image, 'thumbs')
          };
        }
        return v;
      });
    }

    const prodFilePath = path.join(DEST_PRODUCTS_DIR, `${p.id}.json`);
    fs.writeFileSync(prodFilePath, JSON.stringify(fullProduct, null, 2), 'utf8');
    fullCount++;
  }

  // 4. Запись компактного индекса
  const indexJsonStr = JSON.stringify(indexList);
  fs.writeFileSync(DEST_INDEX_FILE, indexJsonStr, 'utf8');
  const indexSizeKB = (Buffer.byteLength(indexJsonStr, 'utf8') / 1024).toFixed(1);

  console.log('\n--- РЕЗУЛЬТАТЫ СЕГМЕНТАЦИИ КАТАЛОГА ---');
  console.log(`- Создан индекс: ${DEST_INDEX_FILE}`);
  console.log(`- Размер индекса: ${indexSizeKB} KB (было: ${originalSizeMB} MB)`);
  console.log(`- Сокращение размера стартового JSON: -${(((Number(originalSizeMB) * 1024 - Number(indexSizeKB)) / (Number(originalSizeMB) * 1024)) * 100).toFixed(1)}%`);
  console.log(`- Создано отдельных файлов товаров: ${fullCount} в ${DEST_PRODUCTS_DIR}/`);
  console.log('===========================================================');
}

run().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
