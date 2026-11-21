/**
 * Скрипт оптимизации изображений для интернет-магазина «Двери №1»
 * Конвертирует PNG/JPG в легковесный WebP:
 * 1. Карточки каталога: data/catalog-output/thumbs/ — ширина 480px, quality 80
 * 2. Детальная страница и модалки: data/catalog-output/webp/ — макс. ширина 1200px, quality 82
 * 3. Hero и категории в корне: WebP рядом с оригиналами, quality 82
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SRC_IMAGES_DIR = path.join(rootDir, 'data', 'catalog-output', 'catalog-images');
const THUMBS_DIR = path.join(rootDir, 'data', 'catalog-output', 'thumbs');
const WEBP_DIR = path.join(rootDir, 'data', 'catalog-output', 'webp');

// Убеждаемся в наличии целевых папок
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
if (!fs.existsSync(WEBP_DIR)) fs.mkdirSync(WEBP_DIR, { recursive: true });

const ROOT_IMAGES = [
  'hero-interior.jpg',
  'category-entrance.jpg',
  'category-glass.jpg',
  'category-interior.jpg',
  'category-invisible.jpg'
];

async function optimizeRootImages() {
  console.log('\n--- Оптимизация заглавных изображений (hero & категории) ---');
  let originalBytes = 0;
  let webpBytes = 0;

  for (const filename of ROOT_IMAGES) {
    const srcPath = path.join(rootDir, filename);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[SKIP] Файл не найден: ${filename}`);
      continue;
    }

    const origSize = fs.statSync(srcPath).size;
    originalBytes += origSize;

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const destPath = path.join(rootDir, `${base}.webp`);

    await sharp(srcPath)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(destPath);

    const newSize = fs.statSync(destPath).size;
    webpBytes += newSize;

    console.log(`[ROOT] ${filename} (${(origSize / 1024).toFixed(1)} KB) -> ${base}.webp (${(newSize / 1024).toFixed(1)} KB) [ -${(((origSize - newSize) / origSize) * 100).toFixed(1)}% ]`);
  }

  return { originalBytes, webpBytes };
}

async function optimizeCatalogImages() {
  console.log('\n--- Оптимизация каталожных изображений ---');
  if (!fs.existsSync(SRC_IMAGES_DIR)) {
    console.error(`Папка не найдена: ${SRC_IMAGES_DIR}`);
    return { originalBytes: 0, thumbsBytes: 0, webpBytes: 0, count: 0 };
  }

  const allFiles = fs.readdirSync(SRC_IMAGES_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
  });

  console.log(`Найдено ${allFiles.length} изображений в ${SRC_IMAGES_DIR}`);

  let totalOriginal = 0;
  let totalThumbs = 0;
  let totalWebp = 0;
  let processed = 0;

  // Пул воркеров для параллельной обработки через sharp (потоки libvips)
  const CONCURRENCY = 16;
  const queue = [...allFiles];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) break;

      const srcPath = path.join(SRC_IMAGES_DIR, file);
      const ext = path.extname(file);
      const base = path.basename(file, ext);
      const thumbDest = path.join(THUMBS_DIR, `${base}.webp`);
      const webpDest = path.join(WEBP_DIR, `${base}.webp`);

      try {
        const origSize = fs.statSync(srcPath).size;
        totalOriginal += origSize;

        // 1. Thumb (480px, quality 80)
        await sharp(srcPath)
          .resize({ width: 480, withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toFile(thumbDest);

        const thumbSize = fs.statSync(thumbDest).size;
        totalThumbs += thumbSize;

        // 2. High-res WebP (1200px max, quality 82)
        await sharp(srcPath)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toFile(webpDest);

        const webpSize = fs.statSync(webpDest).size;
        totalWebp += webpSize;

        processed++;
        if (processed % 200 === 0 || processed === allFiles.length) {
          process.stdout.write(`\r[ПРОГРЕСС] Обработано ${processed} / ${allFiles.length} (${((processed / allFiles.length) * 100).toFixed(1)}%)...`);
        }
      } catch (err) {
        console.error(`\n[ERROR] Ошибка обработки ${file}:`, err.message);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  console.log('\nОбработка каталожных изображений завершена.');

  return {
    originalBytes: totalOriginal,
    thumbsBytes: totalThumbs,
    webpBytes: totalWebp,
    count: processed
  };
}

async function main() {
  const start = Date.now();
  console.log('===========================================================');
  console.log('ДВЕРИ №1 — IMAGE OPTIMIZATION PIPELINE (Node.js + sharp)');
  console.log('===========================================================');

  const rootStats = await optimizeRootImages();
  const catalogStats = await optimizeCatalogImages();

  const totalTime = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n===========================================================');
  console.log('ИТОГОВЫЙ ОТЧЁТ ОПТИМИЗАЦИИ ИЗОБРАЖЕНИЙ:');
  console.log(`- Время выполнения: ${totalTime} сек.`);
  console.log(`- Обработано файлов: ${catalogStats.count} каталожных + ${ROOT_IMAGES.length} заглавных`);
  console.log(`- Исходный вес каталожных PNG: ${(catalogStats.originalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Вес WebP-превью (thumbs/ 480px, q80): ${(catalogStats.thumbsBytes / 1024 / 1024).toFixed(2)} MB [ Экономия ${(((catalogStats.originalBytes - catalogStats.thumbsBytes) / catalogStats.originalBytes) * 100).toFixed(1)}% ]`);
  console.log(`- Вес WebP-детальных (webp/ 1200px, q82): ${(catalogStats.webpBytes / 1024 / 1024).toFixed(2)} MB [ Экономия ${(((catalogStats.originalBytes - catalogStats.webpBytes) / catalogStats.originalBytes) * 100).toFixed(1)}% ]`);
  console.log('===========================================================');
}

main().catch(err => {
  console.error('Критический сбой:', err);
  process.exit(1);
});
