const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, title: 'Тест' };
const window = { location: { href: 'http://localhost/' } };
const context = { window, document, console, URLSearchParams, setTimeout() {}, clearTimeout() {}, localStorage: { getItem() { return '[]'; }, setItem() {} } };
vm.createContext(context);
let productCode = fs.readFileSync('product.js', 'utf8');
productCode = productCode.replace('  // Экспорт для глобального использования', '  window.testOpening = { extractOpeningOptions, extractOpeningTypes };\n  // Экспорт для глобального использования');
vm.runInContext(productCode, context);
const glass = JSON.parse(fs.readFileSync('data/products/PROD-CHAM-101.json'));
assert.deepStrictEqual(Array.from(window.testOpening.extractOpeningOptions(glass)), ['Универсальное']);
assert.deepStrictEqual(Array.from(window.testOpening.extractOpeningTypes(glass)), ['Распашное', 'Раздвижное']);
let files = fs.readdirSync('data/products').filter(f => f.endsWith('.json'));
for (const file of files) {
  const product = JSON.parse(fs.readFileSync('data/products/' + file));
  for (const option of [...window.testOpening.extractOpeningOptions(product), ...window.testOpening.extractOpeningTypes(product)]) {
    assert(!/[(,]$|^[),]/.test(option), file + ': ' + option);
  }
}
let sent = [];
window.DVER_CONFIG = { dispatchLead: async (record, text) => { sent.push({ record, text }); return { ok: true }; } };
window.pdpState = { product: { id: 'OLD', model: 'Старая модель' } };
vm.runInContext(fs.readFileSync('js/leads.js', 'utf8').replace('  function showToastNotice(message) {', '  function showToastNotice(message) { return;'), context);
(async () => {
  const base = { name: 'Тест', phone: '+7 (999) 111-22-33' };
  await window.DverLeads.submitLead(base);
  assert.strictEqual(sent[0].record.product, null);
  for (const [id, name, type] of [['PROD-CHAM-101', 'Glass 1', 'Раздвижное'], ['PROD-TEST-2', 'Вторая модель', 'Распашное']]) {
    await window.DverLeads.submitLead({ ...base, product: { id, name, size: '2000х800 мм', openingType: type, kit: 'Только полотно', options: [] } });
    const current = sent[sent.length - 1];
    assert.strictEqual(current.record.product.id, id);
    assert(current.text.includes(name) && current.text.includes(type) && current.text.includes('Только полотно'));
  }
  await window.DverLeads.submitLead(base);
  assert.strictEqual(sent[3].record.product, null);
  for (const [name, dispatch] of [
    ['ошибка сервера', async () => { throw new Error('HTTP 500'); }],
    ['обрыв сети', async () => { throw new TypeError('Network error'); }],
    ['неподтверждённый ответ', async () => ({ ok: false })],
    ['пустой ответ', async () => null]
  ]) {
    window.DVER_CONFIG.dispatchLead = dispatch;
    const btn = { disabled: false, innerHTML: 'Отправить', classList: { add() {}, remove() {} } };
    await assert.rejects(window.DverLeads.submitLead(base, { submitBtn: btn }), undefined, name);
    assert(!btn.innerHTML.includes('Заявка принята'), name);
  }
  console.log('Проверены каталог, общая заявка, две модели и ответы отправки: успех, ошибка и обрыв сети.');
})().catch(err => { console.error(err); process.exitCode = 1; });
