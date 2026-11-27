const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const products = JSON.parse(fs.readFileSync('data/catalog-index.json'));
const document = { readyState: 'loading', addEventListener() {} };
const window = {};
const ctx = { window, document, console };
vm.createContext(ctx);
let app = fs.readFileSync('app.js', 'utf8').replace('  // Экспорт в глобальное пространство', '  window.audit = { matchesEntranceSubcat, matchesType };\n  // Экспорт в глобальное пространство');
vm.runInContext(app, ctx);
const entrance = products.filter(p => p.category === 'Входные двери');
const apartment = entrance.filter(p => window.audit.matchesEntranceSubcat(p, 'apartment'));
const house = entrance.filter(p => window.audit.matchesEntranceSubcat(p, 'thermo'));
assert(apartment.length && house.length);
assert(apartment.every(p => !window.audit.matchesEntranceSubcat(p, 'thermo')));
assert(products.filter(p => window.audit.matchesType(p, 'invisible')).length);
const source = JSON.parse(fs.readFileSync('data/catalog-output/products.json'));
for (const p of products) {
  const original = source.find(x => x.id === p.id);
  assert(original);
  assert.strictEqual(p.coating, original.specs?.coating || '');
  assert.strictEqual(p.leaf_price, original.leaf_price || null);
}
console.log('Каталог: ' + products.length + ', квартира: ' + apartment.length + ', термо: ' + house.length + '; поля цен и покрытий соответствуют исходным данным.');

let pdp = fs.readFileSync('product.js', 'utf8').replace('  // Экспорт для глобального использования', '  window.priceAudit = { pdpState, calculateCurrentPrice, getLeadProduct, getProductInquiryText };\n  // Экспорт для глобального использования');
vm.runInContext(pdp, ctx);
for (const id of ['PROD-FERR-001', 'PROD-CHAM-101']) {
  const product = JSON.parse(fs.readFileSync('data/products/' + id + '.json'));
  const indexed = products.find(p => p.id === id);
  window.priceAudit.pdpState.product = product;
  window.priceAudit.pdpState.kitType = 'leaf';
  window.priceAudit.pdpState.wcTurn = false;
  assert.strictEqual(window.priceAudit.calculateCurrentPrice(), product.category === 'Входные двери' ? indexed.price : indexed.leaf_price);
  window.priceAudit.pdpState.kitType = 'kit';
  assert.strictEqual(window.priceAudit.calculateCurrentPrice(), window.priceAudit.pdpState.product.category === 'Входные двери' ? indexed.price : indexed.leaf_price);
}
console.log('Начальные цены карточек и страниц товара согласованы; комплект с опциями требует уточнения.');

window.DVER_CONFIG = { KIT_SURCHARGES: { interior: [{id:'hinges',name:'Петли'}], entrance: [{id:'delivery_lift',name:'Доставка'}] } };
for (const id of ['PROD-CHAM-101', 'PROD-FERR-001']) {
  const p = JSON.parse(fs.readFileSync('data/products/' + id + '.json'));
  const state = window.priceAudit.pdpState;
  state.product = p; state.kitType = 'kit'; state.activeSize = 'Тестовый размер'; state.activeOpeningType = 'Тестовый тип'; state.selectedKitOptionIds = [id.includes('CHAM') ? 'hinges' : 'delivery_lift'];
  const lead = window.priceAudit.getLeadProduct();
  assert.strictEqual(lead.id, id); assert.strictEqual(lead.price, null); assert.strictEqual(lead.size, 'Тестовый размер');
  const text = window.priceAudit.getProductInquiryText();
  assert(text.includes(p.model) && text.includes('Тестовый размер') && text.includes('рассчитывается отдельно'));
}
console.log('Выбранные параметры и цена по запросу формируются для двух моделей.');
