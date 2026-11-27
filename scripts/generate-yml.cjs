/**
 * ДВЕРИ №1 — ГЕНЕРАТОР YML-ФИДА ДЛЯ ЯНДЕКС.ТОВАРОВ И ЯНДЕКС.ВЕБМАСТЕРА
 * Создаёт файл feed.yml в корне сайта (https://dver1.com/feed.yml)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog-index.json'), 'utf8'));

const escXml = s => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const CATEGORIES = [
  { id: 1, name: 'Межкомнатные двери' },
  { id: 2, name: 'Входные двери' },
  { id: 3, parentId: 2, name: 'Двери с терморазрывом' },
  { id: 4, parentId: 2, name: 'Двери в квартиру' },
  { id: 5, parentId: 2, name: 'Противопожарные и технические двери' },
  { id: 6, name: 'Скрытые двери' },
  { id: 7, name: 'Двери со стеклом' }
];

function resolveCategoryId(p) {
  const cat = (p.category || '').toLowerCase();
  const text = `${p.name || ''} ${p.model || ''} ${p.description || ''} ${p.series || ''}`.toLowerCase();
  if (cat.includes('скрыт')) return 6;
  if (cat.includes('стекл')) return 7;
  if (cat.includes('входн')) {
    if (/термо/.test(text)) return 3;
    if (/противопожар|дпм|eis|техническ|стройгост|металл\/металл|мет\/мет|мини/.test(text)) return 5;
    return 4;
  }
  return 1;
}

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
const catXml = CATEGORIES.map(c =>
  c.parentId
    ? `      <category id="${c.id}" parentId="${c.parentId}">${escXml(c.name)}</category>`
    : `      <category id="${c.id}">${escXml(c.name)}</category>`
).join('\n');

let offersCount = 0;
const offersXml = catalog
  .filter(p => p.id && Number(p.price) > 0)
  .map(p => {
    offersCount++;
    const url = `https://dver1.com/products/${encodeURIComponent(p.id)}/`;
    const price = Math.round(Number(p.price));
    const catId = resolveCategoryId(p);
    const imgPath = p.thumb || 'door-placeholder.svg';
    const picUrl = new URL(imgPath, 'https://dver1.com/').href;
    const name = [p.brand, p.model || p.name].filter(Boolean).join(' ');
    const available = p.inStock ? 'true' : 'false';
    const desc = p.description || `${name}. Доступен замер и монтаж в Казани и Набережных Челнах.`;

    return `      <offer id="${escXml(p.id)}" available="${available}">
        <url>${escXml(url)}</url>
        <price>${price}</price>
        <currencyId>RUR</currencyId>
        <categoryId>${catId}</categoryId>
        <picture>${escXml(picUrl)}</picture>
        <name>${escXml(name)}</name>
        <vendor>${escXml(p.brand || 'Двери №1')}</vendor>
        <description>${escXml(desc)}</description>
      </offer>`;
  }).join('\n');

const yml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${now}">
  <shop>
    <name>Двери №1</name>
    <company>Двери №1 — Казань и Набережные Челны</company>
    <url>https://dver1.com/</url>
    <currencies>
      <currency id="RUR" rate="1"/>
    </currencies>
    <categories>
${catXml}
    </categories>
    <offers>
${offersXml}
    </offers>
  </shop>
</yml_catalog>
`;

fs.writeFileSync(path.join(root, 'feed.yml'), yml, 'utf8');
fs.writeFileSync(path.join(root, 'feed.xml'), yml, 'utf8');
console.log(`Создан Яндекс YML-фид feed.yml и feed.xml (${offersCount} товаров).`);
