// ==========================================================================
// ДВЕРИ №1 — ГЕНЕРАТОР SITEMAP.XML ДЛЯ GOOGLE И ЯНДЕКС
// Создаёт актуальную карту сайта со всеми страницами и товарами каталога
// ==========================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BASE_URL = 'https://dver1.com';
const CATALOG_INDEX_PATH = path.join(rootDir, 'data', 'catalog-index.json');
const SITEMAP_OUTPUT_PATH = path.join(rootDir, 'sitemap.xml');

function generateSitemap() {
  console.log('[SITEMAP] Starting sitemap generation...');
  const today = new Date().toISOString().split('T')[0];

  let products = [];
  try {
    if (fs.existsSync(CATALOG_INDEX_PATH)) {
      const raw = fs.readFileSync(CATALOG_INDEX_PATH, 'utf8');
      products = JSON.parse(raw);
      console.log(`[SITEMAP] Loaded ${products.length} catalog items from catalog-index.json.`);
    } else {
      console.warn(`[SITEMAP] catalog-index.json not found at ${CATALOG_INDEX_PATH}`);
    }
  } catch (err) {
    console.error('[SITEMAP] Error reading catalog index:', err);
  }

  const urls = [
    {
      loc: `${BASE_URL}/`,
      lastmod: today,
      changefreq: 'daily',
      priority: '1.0'
    },
    {
      loc: `${BASE_URL}/showrooms.html`,
      lastmod: today,
      changefreq: 'weekly',
      priority: '0.8'
    }
  ];

  // Добавляем страницы товаров (только опубликованные)
  products.forEach(p => {
    if (p.id) {
      urls.push({
        loc: `${BASE_URL}/products/${encodeURIComponent(p.id)}/`,
        lastmod: today,
        changefreq: 'weekly',
        priority: '0.7'
      });
    }
  });

  const xmlEntries = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>
`;

  fs.writeFileSync(SITEMAP_OUTPUT_PATH, sitemapXml, 'utf8');
  console.log(`[SITEMAP] Successfully wrote ${urls.length} URLs to ${SITEMAP_OUTPUT_PATH}`);
}

generateSitemap();
