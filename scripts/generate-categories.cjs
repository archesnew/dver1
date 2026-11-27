/**
 * ДВЕРИ №1 — ГЕНЕРАТОР SEO-ПОСАДОЧНЫХ СТРАНИЦ КАТЕГОРИЙ И ГОРОДОВ
 * Создаёт статические HTML-страницы с ЧПУ, H1, BreadcrumbList, FAQPage JSON-LD
 * и прямой перелинковкой на карточки товаров /products/ID/
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog-index.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtPrice = n => new Intl.NumberFormat('ru-RU').format(n);

function matchEntrance(p, type) {
  if (p.category !== 'Входные двери') return false;
  const text = `${p.name || ''} ${p.model || ''} ${p.description || ''} ${p.series || ''} ${p.collection || ''}`.toLowerCase();
  const isThermo = /термо/.test(text);
  const isFireTech = /противопожар|дпм|eis|техническ|стройгост|металл\/металл|мет\/мет|мини/.test(text);
  if (type === 'thermo') return isThermo;
  if (type === 'fire_tech') return isFireTech;
  if (type === 'apartment') return !isThermo && !isFireTech;
  return true;
}

const PAGES = [
  {
    slug: 'mezhkomnatnye-dveri',
    navTitle: 'Межкомнатные двери',
    kicker: 'ПВХ (ПВХ, ПЭТ, экошпон) • Эмаль • Шпон натуральный',
    h1: 'Межкомнатные двери в Казани и Набережных Челнах',
    title: 'Межкомнатные двери — купить в Казани и Набережных Челнах | Двери №1',
    description: 'Межкомнатные двери эконом и среднего сегмента: ПВХ, ПЭТ, экошпон, эмаль, натуральный шпон. В наличии на складе и под заказ с замером и установкой.',
    intro: 'В каталоге собраны межкомнатные двери от проверенных фабрик — от практичных моделей с покрытием ПВХ, ПЭТ и экошпон до эмали и натурального шпона. Помогаем с расчётом погонажа, подбором фурнитуры, замером и монтажом.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Межкомнатные двери') + '#catalogContent',
    filter: p => p.category === 'Межкомнатные двери',
    faq: [
      { q: 'Какие покрытия межкомнатных дверей лучше выбрать для квартиры?', a: 'Для спален и гостиных часто выбирают эмаль или натуральный шпон, а для санузлов и активной эксплуатации практичнее ПВХ, ПЭТ или экошпон — они устойчивы к влаге и перепадам температуры.' },
      { q: 'Что входит в стандартный комплект межкомнатной двери?', a: 'Стандартный комплект включает полотно, коробку (2,5 стойки) и наличники на две стороны (5 стоек). При необходимости добавляются доборы под толщину стены и комплект фурнитуры.' },
      { q: 'Как быстро возможна доставка в Казани и Набережных Челнах?', a: 'Складские позиции отгружаются за 1–2 дня. Модели под заказ с фабрики доставляются в согласованные сроки после замера.' }
    ]
  },
  {
    slug: 'vhodnye-dveri',
    navTitle: 'Входные двери',
    kicker: 'С терморазрывом • В квартиру • Противопожарные и технические',
    h1: 'Входные металлические двери в Казани и Набережных Челнах',
    title: 'Входные двери — купить в Казани и Набережных Челнах | Двери №1',
    description: 'Входные двери с терморазрывом для дома, надёжные двери в квартиру с шумоизоляцией и зеркалом, противопожарные и технические двери. Замер и установка.',
    intro: 'Предлагаем входные металлические двери для любых задач: с терморазрывом для частных домов и коттеджей, тихие и взломостойкие модели в квартиру, а также противопожарные и технические двери.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Входные двери') + '#catalogContent',
    filter: p => p.category === 'Входные двери',
    faq: [
      { q: 'Чем отличается дверь с терморазрывом от обычной входной двери?', a: 'В конструкции с терморазрывом внешняя и внутренняя части полотна и короба разделены термоизолирующим слоем, благодаря чему дверь не промерзает и не покрывается конденсатом зимой.' },
      { q: 'Какие входные двери подойдут для квартиры?', a: 'Для квартиры оптимальны двери с 2–3 контурами уплотнения, минеральной плитой или пенополиуретаном для шумоизоляции и двумя разносистемными замками (сувальдный + цилиндровый).' },
      { q: 'Выполняете ли вы демонтаж старой двери и установку новой?', a: 'Да, мастера выполняют замер, доставку, демонтаж старой конструкции и чистовой монтаж новой входной двери с гарантией.' }
    ]
  },
  {
    slug: 'dveri-s-termorazryvom',
    navTitle: 'Двери с терморазрывом',
    kicker: 'Для частного дома и коттеджа',
    h1: 'Входные двери с терморазрывом для частного дома',
    title: 'Входные двери с терморазрывом — купить в Казани и Челнах | Двери №1',
    description: 'Утеплённые входные двери с терморазрывом для коттеджа и частного дома в Казани и Набережных Челнах. Защита от промерзания и наледи. Замер и монтаж.',
    intro: 'Двери с терморазрывом разработаны специально для установки на границе «улица — дом». Многослойное утепление и терморазрыв в полотне и коробе защищают от мостиков холода и конденсата даже в сильные морозы.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Входные двери') + '#catalogContent',
    filter: p => matchEntrance(p, 'thermo'),
    faq: [
      { q: 'Нужен ли козырёк над уличной дверью с терморазрывом?', a: 'Да, для любой уличной двери рекомендуется наличие козырька или навеса, защищающего декоративную отделку от прямых осадков и палящего солнца.' },
      { q: 'Какая толщина полотна у дверей с терморазрывом?', a: 'В каталоге представлены модели с толщиной полотна от 90 до 130 мм с многослойным утеплением и несколькими контурами уплотнителя.' },
      { q: 'Есть ли модели со стеклопакетом и ковкой?', a: 'Да, доступны как глухие утеплённые модели, так и варианты с двухкамерным энергосберегающим стеклопакетом.' }
    ]
  },
  {
    slug: 'dveri-v-kvartiru',
    navTitle: 'Двери в квартиру',
    kicker: 'Шумоизоляция • Надёжные замки • Варианты с зеркалом',
    h1: 'Входные двери в квартиру в Казани и Набережных Челнах',
    title: 'Входные двери в квартиру — купить в Казани и Челнах | Двери №1',
    description: 'Металлические входные двери в квартиру с повышенной шумоизоляцией, внутренними МДФ-панелями и зеркалом. В наличии и под заказ в Казани и Челнах.',
    intro: 'Входные двери для квартиры с акцентом на тишину в прихожей, герметичность от запахов из подъезда и современный дизайн внутренней панели — включая популярные модели с ростовым зеркалом.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Входные двери') + '#catalogContent',
    filter: p => matchEntrance(p, 'apartment'),
    faq: [
      { q: 'Как подобрать цвет внутренней панели входной двери под межкомнатные?', a: 'В наличии есть модели со сменными и встроенными МДФ-панелями в оттенках белый матовый, эмалит, бетон снежный, графит, дуб и орех — легко сочетать с межкомнатными дверьми.' },
      { q: 'Надёжно ли держится зеркало на входной двери?', a: 'Да, используется закалённое зеркало с безопасной подложкой, надёжно зафиксированное в конструкции МДФ-панели.' },
      { q: 'Как узнать, какое открывание двери мне нужно — левое или правое?', a: 'Вы можете уточнить это при замере — мастер бесплатно определит точную сторону открывания и габариты проёма.' }
    ]
  },
  {
    slug: 'protivopozharnye-dveri',
    navTitle: 'Противопожарные и технические',
    kicker: 'ДПМ EIS-60 • Строительные • Металл/металл',
    h1: 'Противопожарные и технические двери',
    title: 'Противопожарные и технические двери — купить в Казани и Челнах | Двери №1',
    description: 'Противопожарные двери ДПМ EIS-60, технические и строительные двери металл/металл для офисов, коммерции, подъездов и тамбуров в Казани и Челнах.',
    intro: 'Практичные стальные двери для коммерческих помещений, котельных, тамбуров, офисов и строительных объектов: противопожарные сертифицированные двери ДПМ и недорогие технические модели металл/металл.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Входные двери') + '#catalogContent',
    filter: p => matchEntrance(p, 'fire_tech'),
    faq: [
      { q: 'Есть ли двери для коммерческих помещений и котельных?', a: 'Да, представлены сертифицированные противопожарные модели и износостойкие двери металл/металл с порошковым покрытием.' },
      { q: 'Можно ли заказать нестандартные или двустворчатые технические двери?', a: 'Да, доступны как стандартные однопольные (860/960 мм), так и полуторные и двустворчатые модели (1200–1300 мм).' },
      { q: 'Работаете ли вы с юридическими лицами и строителями?', a: 'Да, комплектуем объекты любого объёма и предоставляем специальные условия для прорабов и застройщиков.' }
    ]
  },
  {
    slug: 'skrytye-dveri',
    navTitle: 'Скрытые двери',
    kicker: 'Алюминиевый короб Invisible • Под покраску и штукатурку',
    h1: 'Скрытые двери (Invisible) в Казани и Набережных Челнах',
    title: 'Скрытые двери под покраску Invisible — купить в Казани и Челнах | Двери №1',
    description: 'Двери скрытого монтажа на алюминиевом коробе под покраску, обои или декоративную штукатурку. Прямое и обратное открывание. Замер и монтаж в Казани и Челнах.',
    intro: 'Скрытые двери устанавливаются вровень со стеной без наличников. Загрунтованное полотно можно окрасить в цвет стен, оклеить обоями или покрыть декоративной штукатуркой.',
    catalogLink: 'index.html?cat=' + encodeURIComponent('Скрытые двери') + '#catalogContent',
    filter: p => p.category === 'Скрытые двери' || /скрыт|invisible/i.test(`${p.name || ''} ${p.model || ''}`),
    faq: [
      { q: 'На каком этапе ремонта нужно устанавливать скрытый короб?', a: 'Алюминиевый короб скрытого монтажа устанавливается до чистовой отделки стен (на этапе черновых или предчистовых работ, до шпаклёвки и покраски).' },
      { q: 'Какое открывание бывает у скрытых дверей?', a: 'Доступны варианты как прямого открывания (на себя), так и реверсивного открывания (внутрь проёма) при сохранении единой плоскости со стеной.' },
      { q: 'Какие петли и замки используются?', a: 'Комплектуются регулируемыми скрытыми петлями (обычно итальянскими или усиленными аналогами) и бесшумными магнитными замками.' }
    ]
  },
  {
    slug: 'kazan',
    navTitle: 'Казань',
    kicker: 'г. Казань • ул. Рихарда Зорге, 100 • Ежедневно 09:00–19:00',
    h1: 'Купить двери в Казани — каталог «Двери №1»',
    title: 'Купить двери в Казани — межкомнатные и входные двери | Двери №1',
    description: 'Магазин дверей в Казани на ул. Рихарда Зорге, 100 («Двери Голливуда»). Межкомнатные и входные двери эконом и среднего сегмента в наличии и под заказ. Тел: +7 (965) 627-10-10.',
    intro: 'В Казани приглашаем в магазин «Двери Голливуда» по адресу ул. Рихарда Зорге, 100 (ежедневно с 09:00 до 19:00). Здесь можно посмотреть образцы покрытий вживую, подобрать комплект межкомнатных и входных дверей и заказать замер по Казани и пригороду.',
    catalogLink: 'index.html#catalogContent',
    filter: p => Boolean(p.inStock),
    faq: [
      { q: 'Где находится магазин дверей в Казани?', a: 'г. Казань, ул. Рихарда Зорге, 100 (магазин «Двери Голливуда»). Работаем ежедневно с 09:00 до 19:00.' },
      { q: 'Как оформить заказ онлайн в Казани?', a: 'Вы можете добавить модели в корзину на сайте или написать напрямую в Telegram (@dveri_1), MAX или WhatsApp на номер +7 (965) 627-10-10.' },
      { q: 'Выезжает ли замерщик в пригород Казани?', a: 'Да, выполняем замеры и доставку как по всей Казани, так и в ближайшие посёлки и коттеджные посёлки.' }
    ]
  },
  {
    slug: 'naberezhnye-chelny',
    navTitle: 'Набережные Челны',
    kicker: 'г. Набережные Челны • ТЦ «Кама», Московский пр-т, 126Б, 2 эт.',
    h1: 'Купить двери в Набережных Челнах — «Двери №1»',
    title: 'Купить двери в Набережных Челнах — межкомнатные и входные | Двери №1',
    description: 'Магазин «Двери №1» в Набережных Челнах: ТЦ «Кама», пр-т Московский, 126Б (53/07а), 2 этаж. Межкомнатные и входные двери по доступным ценам. Ежедневно 09:00–18:00.',
    intro: 'В Набережных Челнах ждём вас в магазине «Двери №1» в ТЦ «Кама» (проспект Московский, 126Б / 53/07а, Большая Кама — ближе к «Тулпар», с эскалатора налево, 2 этаж). Работаем ежедневно с 09:00 до 18:00.',
    catalogLink: 'index.html#catalogContent',
    filter: p => Boolean(p.inStock),
    faq: [
      { q: 'Как найти магазин «Двери №1» в Набережных Челнах?', a: 'ТЦ «Кама», пр-т Московский, 126Б (53/07а), 2 этаж — Большая Кама (ближе к «Тулпар»), с эскалатора налево.' },
      { q: 'Какой график работы в Челнах?', a: 'Магазин работает ежедневно с 09:00 до 18:00. Онлайн-заявки принимаем через сайт, Telegram, MAX и WhatsApp (+7 965 627-10-10).' },
      { q: 'Есть ли доставка по Закамью?', a: 'Да, организуем доставку и установку по Набережным Челнам и ближайшим городам Закамья (Нижнекамск, Елабуга, Менделеевск).' }
    ]
  }
];

function buildPageHtml(page) {
  const matched = catalog.filter(page.filter);
  const sorted = [...matched].sort((a, b) => (b.inStock ? 1 : 0) - (a.inStock ? 1 : 0) || (a.price || 999999) - (b.price || 999999));
  const items = sorted.slice(0, 48);
  const priced = matched.filter(p => p.price > 0);
  const minPrice = priced.length ? Math.min(...priced.map(p => p.price)) : 0;

  const url = `https://dver1.com/${page.slug}/`;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://dver1.com/' },
      { '@type': 'ListItem', position: 2, name: page.navTitle, item: url }
    ]
  };
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  const navLinksHtml = PAGES.map(p =>
    `<a href="${p.slug}/" class="seo-hub-pill${p.slug === page.slug ? ' active' : ''}">${esc(p.navTitle)}</a>`
  ).join('\n          ');

  const cardsHtml = items.map(p => {
    const img = p.thumb || 'door-placeholder.svg';
    const priceText = p.price > 0 ? `${fmtPrice(p.price)} ₽` : 'По запросу';
    const modelName = p.model || p.name || 'Дверь';
    const brandName = p.brand || 'Двери №1';
    return `
      <article class="product-card">
        <a href="products/${encodeURIComponent(p.id)}/" class="card-media-box">
          ${p.inStock ? '<span class="badge-in-stock">В наличии</span>' : ''}
          <img src="${esc(img)}" alt="${esc(brandName + ' ' + modelName)}" loading="lazy" decoding="async" onerror="this.src='door-placeholder.svg'">
        </a>
        <div class="card-body">
          <div class="card-meta">${esc(brandName)}</div>
          <h2 class="card-title"><a href="products/${encodeURIComponent(p.id)}/" style="color:inherit;text-decoration:none;">${esc(modelName)}</a></h2>
          <div class="card-footer">
            <div class="card-price">${priceText}</div>
            <a href="products/${encodeURIComponent(p.id)}/" class="btn-card-more">Подробнее →</a>
          </div>
        </div>
      </article>`;
  }).join('\n');

  const faqHtml = page.faq.map(f => `
          <details class="seo-faq-item">
            <summary class="seo-faq-q">${esc(f.q)}</summary>
            <div class="seo-faq-a">${esc(f.a)}</div>
          </details>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <base href="/">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${url}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Двери №1">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:image" content="https://dver1.com/assets/hero-arch.webp">
  <meta property="og:url" content="${url}">
  <meta property="og:locale" content="ru_RU">

  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c')}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd).replace(/</g, '\\u003c')}</script>

  <link rel="icon" type="image/png" href="favicon.png?v=2">
  <link rel="apple-touch-icon" href="favicon.png?v=2">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&subset=cyrillic&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="app.css?v=4.9.0">
  <script src="cart-store.js?v=4.9.0"></script>
  <!-- Yandex.Metrika counter -->
  <script type="text/javascript">
      (function(m,e,t,r,i,k,a){
          m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
      })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=114727314', 'ym');

      ym(114727314, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
  </script>
  <noscript><div><img src="https://mc.yandex.ru/watch/114727314" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
  <!-- /Yandex.Metrika counter -->
</head>
<body>
  <header class="site-header" id="siteHeader">
    <div class="header-container">
      <a href="index.html" class="header-logo-link" aria-label="«Двери №1» — Главная">
        <img src="logo.png" alt="Двери №1" class="header-logo-img" width="168" height="38">
      </a>
      <nav class="header-nav" id="headerNav" aria-label="Основная навигация">
        <a href="index.html#catalogContent" class="header-nav-link">Каталог</a>
        <a href="mezhkomnatnye-dveri/" class="header-nav-link${page.slug === 'mezhkomnatnye-dveri' ? ' active' : ''}">Межкомнатные</a>
        <a href="vhodnye-dveri/" class="header-nav-link${page.slug === 'vhodnye-dveri' ? ' active' : ''}">Входные</a>
        <a href="skrytye-dveri/" class="header-nav-link${page.slug === 'skrytye-dveri' ? ' active' : ''}">Скрытые</a>
        <a href="showrooms.html" class="header-nav-link">Шоурумы</a>
      </nav>
      <div class="header-actions">
        <a href="cart.html" class="btn-glass-cart" id="btnHeaderCart" aria-label="Корзина">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span class="cart-badge-count" id="headerCartCount">0</span>
        </a>
        <button type="button" class="btn-glass-cta" onclick="if(window.DverLeads) window.DverLeads.openLeadModal({ source: 'SEO страница: ${esc(page.navTitle)}' });">
          Записаться на замер
        </button>
      </div>
    </div>
  </header>

  <main style="padding-top: 96px; padding-bottom: 64px; flex: 1;">
    <div class="editorial-container">
      <nav class="breadcrumbs" aria-label="Хлебные крошки" style="margin-bottom: 18px; font-size: 0.85rem; color: var(--text-muted);">
        <a href="index.html" style="color: inherit; text-decoration: none;">Главная</a>
        <span style="margin: 0 8px;">/</span>
        <span style="color: var(--text-primary); font-weight: 500;">${esc(page.navTitle)}</span>
      </nav>

      <div class="editorial-kicker">${esc(page.kicker)}</div>
      <h1 class="editorial-title" style="font-size: clamp(1.9rem, 3.2vw, 2.75rem); line-height: 1.1; margin: 6px 0 14px; text-align: left;">
        ${esc(page.h1)}
      </h1>
      <p class="editorial-subtitle" style="text-align: left; max-width: 780px; margin: 0 0 18px;">
        ${esc(page.intro)}
      </p>

      <div class="seo-stats-row">
        <span class="seo-stat-pill">Моделей в разделе: <strong>${matched.length}</strong></span>
        ${minPrice > 0 ? `<span class="seo-stat-pill">Цены: <strong>от ${fmtPrice(minPrice)} ₽</strong></span>` : ''}
        <span class="seo-stat-pill">Казань и Набережные Челны</span>
      </div>

      <div class="seo-hub-pills" aria-label="Разделы каталога">
          ${navLinksHtml}
      </div>

      <div class="product-grid" style="margin-top: 24px;">
        ${cardsHtml}
      </div>

      <div style="text-align: center; margin-top: 34px;">
        <a href="${esc(page.catalogLink)}" class="btn-hero-primary" style="text-decoration: none;">
          Открыть все модели (${matched.length}) с фильтрами →
        </a>
      </div>

      <section class="seo-faq-section" aria-label="Частые вопросы">
        <h2 class="seo-faq-title">Частые вопросы</h2>
        <div class="seo-faq-list">
          ${faqHtml}
        </div>
      </section>
    </div>
  </main>

  <footer class="site-footer" id="siteFooter">
    <div class="footer-container">
      <div>
        <img src="logo-white.png" alt="Двери №1" width="142" height="32" style="display: block; height: 32px; width: auto; margin-bottom: 8px;">
        <div style="color: #8E8C84; margin-bottom: 10px;">Казань и Набережные Челны</div>
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <a href="https://t.me/dveri_1" target="_blank" rel="noopener noreferrer" style="color: #E08A68; text-decoration: none; font-weight: 500;">Telegram</a>
          <a href="https://max.ru/join/ta3eyKCyExYWI37TCWrSAkzOkKTQAamITFpQHj9FEi4" target="_blank" rel="noopener noreferrer" style="color: #E08A68; text-decoration: none; font-weight: 500;">MAX</a>
        </div>
      </div>
      <div>
        <div style="color: #FFFFFF; font-weight: 600; margin-bottom: 6px;">Адреса</div>
        <div style="margin-bottom: 6px;">Казань: ул. Рихарда Зорге, 100 (09:00–19:00)</div>
        <div>Челны: ТЦ «Кама», Московский пр-т, 126Б, 2 эт. (09:00–18:00)</div>
      </div>
      <div>
        <div style="color: #FFFFFF; font-weight: 600; margin-bottom: 6px;">Контакты</div>
        <div style="margin-bottom: 4px;">
          <a href="tel:+79656271010" style="color: #FFFFFF; font-size: 1.05rem; font-weight: 600; text-decoration: none; font-variant-numeric: tabular-nums;">+7 (965) 627-10-10</a>
        </div>
        <div style="color: #8E8C84;">Telegram • MAX • WhatsApp</div>
      </div>
    </div>
    <div class="footer-bottom-bar">
      <div>© 2026 Двери №1</div>
    </div>
  </footer>

  <script src="js/config.js?v=4.9.0"></script>
  <script src="js/analytics.js?v=4.9.0"></script>
  <script src="js/leads.js?v=4.9.0"></script>
</body>
</html>`;
}

for (const page of PAGES) {
  const dir = path.join(root, page.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildPageHtml(page), 'utf8');
}

console.log(`Создано SEO-страниц категорий и городов: ${PAGES.length}`);
