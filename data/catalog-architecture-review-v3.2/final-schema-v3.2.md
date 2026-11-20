# ЕДИНАЯ АКТУАЛЬНАЯ АРХИТЕКТУРНАЯ СХЕМА БАЗЫ ДАННЫХ И DDL (V3.2 FINAL)

**Проект:** Федеральный интернет-магазин «Двери №1»  
**Города присутствия:** Казань (Сибирский тракт, 59б), Набережные Челны (Казанский проспект, 232)  
**Версия документа:** 3.2 (Полная синхронизация со всеми правилами V3.1 и устранение противоречий)  
**Статус:** Проектная спецификация (БЕЗ создания таблиц в рабочей СУБД и запуска миграций)  

---

## 1. Архитектурные исправления в версии V3.2

В версии V3.2 устранены последние остаточные расхождения между техническим DDL и бизнес-правилами:
1. **Разделение `is_active` и `is_published`:**  
   - `is_active` — внутренний жизненный цикл карточки в учетной системе (черновик / в работе / в архиве).
   - `is_published` — видимость на витрине и доступность для поисковых систем (SEO).
2. **Введение статуса цены `'pending_price'`:**  
   - Для стандартных моделей, у которых розничная цена еще не загружена из прайс-листа или находится на пересмотре категорийным менеджером, введен статус `'pending_price'`.
   - Статус `'quote'` оставлен **строго для заказных индивидуальных изделий** (нестандартная высота 2100–2700 мм, покраска по RAL, индивидуальные фрезеровки).
3. **Очистка физического складского статуса (`stock_status`):**  
   - Из таблицы `stock_items` исключен статус `'on_order_factory'`. Физический склад может отражать только фактическое наличие: `'in_stock'` (доступен), `'reserved'` (весь остаток в брони), `'out_of_stock'` (остаток равен 0). Заказ на фабрике относится строго к уровню поставщика (`product_suppliers.supplier_status = 'on_order'`).
4. **Синхронизация `item_kind`:**  
   - В `order_items` явно добавлены типы `'wc_turn'` (сантехническая завертка), `'escutcheon'` (накладка под ключ) и `'h_beam'` (Н-образный соединитель составных доборов).
5. **Синхронизация классификатора услуг (`order_services`):**  
   - Устранены устаревшие коды; перенесен полный перечень: раздельный демонтаж деревянных и металлических дверей, раздельная доставка (город / пригород), раздельный подъем (лифт / лестница), вывоз мусора как самостоятельная услуга.
6. **Защита подтвержденных заказов от модификации (Immutability Trigger):**  
   - Внедрен триггер `trg_protect_confirmed_orders`, аппаратно блокирующий любые изменения (`UPDATE` / `DELETE`) строк товаров и услуг после подтверждения заказа менеджером (`order_status >= 'stock_reserved'`).

---

## 2. Полный чистовой PostgreSQL DDL (V3.2 Final)

```sql
-- ============================================================================
-- БАЗА ДАННЫХ ИНТЕРНЕТ-МАГАЗИНА «ДВЕРИ №1» (V3.2 FINAL)
-- СУБД: PostgreSQL 14+ / 15+ / 16+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================================
-- 1. ПРОИЗВОДИТЕЛИ И БРЕНДЫ (BRANDS)
-- ============================================================================
CREATE TABLE brands (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE brands IS 'Фабрики и заводы-изготовители дверной продукции и фурнитуры';

-- ============================================================================
-- 2. ПОСТАВЩИКИ И ДИСТРИБЬЮТОРЫ (SUPPLIERS)
-- Независимая сущность контрагентов, оптовых баз и дилеров
-- ============================================================================
CREATE TABLE suppliers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,              -- Название поставщика (например: 'Двери Голливуда Опт')
    legal_name VARCHAR(255),                 -- Юрлицо (ООО / ИП)
    inn VARCHAR(12),                         -- ИНН
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    city VARCHAR(100) NOT NULL,              -- Город склада отгрузки
    warehouse_address VARCHAR(255),          -- Физический адрес склада
    default_lead_time_days INT NULL,         -- Регламентный срок (если зафиксирован в договоре)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE suppliers IS 'Контрагенты, оптовые склады и дистрибьюторы';

-- ============================================================================
-- 3. КОЛЛЕКЦИИ (COLLECTIONS)
-- ============================================================================
CREATE TABLE collections (
    id VARCHAR(64) PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_collection_category CHECK (
        category IN ('Входные двери', 'Межкомнатные двери', 'Скрытые двери', 'Фурнитура', 'Специальные двери')
    )
);

-- ============================================================================
-- 4. МАСТЕР-КАРТОЧКИ ТОВАРОВ (PRODUCTS)
-- ============================================================================
CREATE TABLE products (
    id VARCHAR(64) PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    collection_id VARCHAR(64) NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
    model_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    door_type VARCHAR(100),
    construction VARCHAR(255),
    coating_type VARCHAR(100),
    style VARCHAR(100),
    has_glass BOOLEAN NOT NULL DEFAULT FALSE,
    glass_type VARCHAR(255),
    
    -- Конструктивно-ценовая модель:
    pricing_type VARCHAR(32) NOT NULL, -- 'monolithic_block', 'modular_kit', 'invisible_kit'
    
    base_leaf_price NUMERIC(10,2) NULL,
    base_kit_price NUMERIC(10,2) NULL,
    
    -- Статус ценообразования (синхронизировано: 4 значения)
    price_status VARCHAR(32) NOT NULL DEFAULT 'pending_price',
    
    -- Разделение публикации и жизненного цикла:
    is_active BOOLEAN NOT NULL DEFAULT TRUE,       -- Внутренний статус модели (черновик / активна / в архиве)
    is_published BOOLEAN NOT NULL DEFAULT FALSE,   -- БЕЗОПАСНЫЙ DEFAULT: по умолчанию НЕ опубликована на витрине и в SEO
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_product_pricing_type CHECK (
        pricing_type IN ('monolithic_block', 'modular_kit', 'invisible_kit')
    ),
    CONSTRAINT chk_product_price_status CHECK (
        price_status IN ('fixed', 'from', 'quote', 'pending_price')
    )
);

COMMENT ON COLUMN products.is_active IS 'Внутренний статус модели в каталоге магазина';
COMMENT ON COLUMN products.is_published IS 'Публикация страницы на витрине и в sitemap.xml для SEO';
COMMENT ON COLUMN products.price_status IS 'fixed=фиксированная, from=от X руб, quote=индивидуальный заказ, pending_price=ожидает прайса';

-- ============================================================================
-- 5. ИСТОЧНИКИ ПОСТАВКИ (PRODUCT_SUPPLIERS)
-- ============================================================================
CREATE TABLE product_suppliers (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id VARCHAR(64) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    supplier_article VARCHAR(100),
    catalog_name VARCHAR(255) NOT NULL,
    catalog_page INT NOT NULL,
    purchase_price NUMERIC(10,2) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    supplier_status VARCHAR(32) NOT NULL DEFAULT 'on_order', -- 'active', 'on_order', 'discontinued'
    lead_time_days INT NULL, -- NULL = уточняется менеджером, запрет выдуманных сроков
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_product_supplier_status CHECK (
        supplier_status IN ('active', 'on_order', 'discontinued')
    ),
    CONSTRAINT uq_product_supplier UNIQUE (product_id, supplier_id)
);

-- ============================================================================
-- 6. ВАРИАНТЫ ИСПОЛНЕНИЯ ПОЛОТЕН (PRODUCT_VARIANTS)
-- ============================================================================
CREATE TABLE product_variants (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    height_mm INT NOT NULL,
    width_mm INT NOT NULL,
    thickness_mm INT NOT NULL DEFAULT 38,
    outside_color VARCHAR(255) NOT NULL,
    inside_color VARCHAR(255),
    is_composite_color BOOLEAN NOT NULL DEFAULT FALSE,
    opening_direction VARCHAR(32) NOT NULL DEFAULT 'universal', -- 'universal', 'left', 'right', 'direct', 'reverse'
    image_url VARCHAR(500),
    price_delta NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_variant_opening_dir CHECK (
        opening_direction IN ('universal', 'left', 'right', 'direct', 'reverse')
    ),
    CONSTRAINT chk_variant_dims CHECK (
        height_mm BETWEEN 1500 AND 3000 AND width_mm BETWEEN 300 AND 1400 AND thickness_mm BETWEEN 30 AND 160
    )
);

-- ============================================================================
-- 7. НОМЕНКЛАТУРА ПОГОНАЖНЫХ ИЗДЕЛИЙ (MOLDING_ITEMS)
-- ============================================================================
CREATE TABLE molding_items (
    id VARCHAR(64) PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    article VARCHAR(100) UNIQUE,
    molding_type VARCHAR(64) NOT NULL, -- 'frame', 'casing', 'extension', 'plinth', 'invisible_frame', 'false_beam', 'h_beam'
    name VARCHAR(255) NOT NULL,
    coating_type VARCHAR(100),
    color VARCHAR(255) NOT NULL,
    length_mm INT NOT NULL DEFAULT 2070,
    width_mm INT NOT NULL,
    thickness_mm INT NOT NULL,
    unit VARCHAR(16) NOT NULL DEFAULT 'pc',
    unit_price NUMERIC(10,2) NULL,
    price_status VARCHAR(32) NOT NULL DEFAULT 'fixed',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_molding_type CHECK (
        molding_type IN ('frame', 'casing', 'extension', 'plinth', 'invisible_frame', 'false_beam', 'h_beam')
    ),
    CONSTRAINT chk_molding_unit CHECK (
        unit IN ('pc', 'set', 'meter')
    )
);

-- ============================================================================
-- 8. НОРМАТИВЫ КОМПЛЕКТАЦИИ ПОГОНАЖЕМ (PRODUCT_MOLDING_RULES)
-- ============================================================================
CREATE TABLE product_molding_rules (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    molding_item_id VARCHAR(64) NOT NULL REFERENCES molding_items(id) ON DELETE RESTRICT,
    role VARCHAR(32) NOT NULL, -- 'default_frame', 'default_casing', 'decorative_casing', 'compatible_extension', 'h_beam'
    default_quantity NUMERIC(4,2) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_molding_role CHECK (
        role IN ('default_frame', 'default_casing', 'decorative_casing', 'compatible_extension', 'invisible_frame', 'h_beam')
    ),
    CONSTRAINT uq_product_molding_rule UNIQUE (product_id, molding_item_id, role)
);

-- ============================================================================
-- 9. КАТАЛОГ БАЗОВОЙ ФУРНИТУРЫ (HARDWARE)
-- ============================================================================
CREATE TABLE hardware (
    id VARCHAR(64) PRIMARY KEY,
    brand_id VARCHAR(64) NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    collection_name VARCHAR(255),
    model_name VARCHAR(255) NOT NULL,
    hardware_type VARCHAR(64) NOT NULL,
    material VARCHAR(100),
    rosette_thickness_mm INT DEFAULT 6,
    door_thickness_min INT DEFAULT 35,
    door_thickness_max INT DEFAULT 55,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_hardware_type CHECK (
        hardware_type IN (
            'handle_rosette', 'handle_plate', 'hinge_concealed', 'hinge_butt',
            'lock_magnetic', 'lock_cylinder', 'closer', 'stopper', 'wc_turn', 'escutcheon'
        )
    )
);

-- ============================================================================
-- 10. ЦВЕТОВЫЕ SKU ФУРНИТУРЫ (HARDWARE_VARIANTS)
-- ============================================================================
CREATE TABLE hardware_variants (
    id VARCHAR(64) PRIMARY KEY,
    hardware_id VARCHAR(64) NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
    article VARCHAR(100) UNIQUE NOT NULL,
    color_finish VARCHAR(255) NOT NULL,
    color_code VARCHAR(32),
    image_url VARCHAR(500),
    price NUMERIC(10,2) NULL,
    price_status VARCHAR(32) NOT NULL DEFAULT 'fixed',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 11. ПРАВИЛА СОВМЕСТИМОСТИ ФУРНИТУРЫ (COMPATIBLE_HARDWARE)
-- ============================================================================
CREATE TABLE compatible_hardware (
    id SERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    hardware_id VARCHAR(64) NOT NULL REFERENCES hardware(id) ON DELETE CASCADE,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified', -- 'verified_factory', 'unverified', 'prohibited'
    hardware_role VARCHAR(32) NOT NULL DEFAULT 'recommended_addon',
    quantity_required INT NOT NULL DEFAULT 1,
    compatibility_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_hardware_verif_status CHECK (
        verification_status IN ('verified_factory', 'unverified', 'prohibited')
    ),
    CONSTRAINT chk_hardware_role CHECK (
        hardware_role IN ('default_included', 'recommended_addon', 'optional')
    ),
    CONSTRAINT uq_product_hardware UNIQUE (product_id, hardware_id)
);

-- ============================================================================
-- 12. СКЛАДЫ (WAREHOUSES)
-- ============================================================================
CREATE TABLE warehouses (
    id VARCHAR(32) PRIMARY KEY, -- 'kazan_central', 'chelny_hub'
    city VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 13. СКЛАДСКИЕ ОСТАТКИ (STOCK_ITEMS)
-- Синхронизировано: только физические статусы склада, чистая логика
-- ============================================================================
CREATE TABLE stock_items (
    id SERIAL PRIMARY KEY,
    warehouse_id VARCHAR(32) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    
    -- ЯВНЫЕ ВНЕШНИЕ КЛЮЧИ EXCLUSIVE ARC:
    variant_id VARCHAR(64) NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    molding_id VARCHAR(64) NULL REFERENCES molding_items(id) ON DELETE RESTRICT,
    hardware_variant_id VARCHAR(64) NULL REFERENCES hardware_variants(id) ON DELETE RESTRICT,
    
    stock_qty INT NOT NULL DEFAULT 0,
    reserved_qty INT NOT NULL DEFAULT 0,
    available_qty INT GENERATED ALWAYS AS (stock_qty - reserved_qty) STORED,
    
    -- Физический статус склада (on_order_factory исключен!):
    stock_status VARCHAR(32) NOT NULL DEFAULT 'out_of_stock',
    manager_confirmation_required BOOLEAN NOT NULL DEFAULT TRUE,
    last_inventory_date TIMESTAMP WITH TIME ZONE NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_stock_single_item CHECK (
        num_nonnulls(variant_id, molding_id, hardware_variant_id) = 1
    ),
    CONSTRAINT chk_stock_quantities CHECK (
        stock_qty >= 0 AND reserved_qty >= 0 AND reserved_qty <= stock_qty
    ),
    CONSTRAINT chk_stock_status_enum CHECK (
        stock_status IN ('in_stock', 'reserved', 'out_of_stock')
    ),
    CONSTRAINT uq_warehouse_variant UNIQUE (warehouse_id, variant_id),
    CONSTRAINT uq_warehouse_molding UNIQUE (warehouse_id, molding_id),
    CONSTRAINT uq_warehouse_hardware UNIQUE (warehouse_id, hardware_variant_id)
);

COMMENT ON COLUMN stock_items.stock_status IS 'Физический статус склада: in_stock=есть свободные, reserved=все в брони, out_of_stock=нет на складе';

-- ============================================================================
-- 14. ЗАКАЗЫ (ORDERS)
-- ============================================================================
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(32) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255),
    customer_city VARCHAR(64) NOT NULL,      -- 'Казань', 'Набережные Челны'
    delivery_address TEXT,
    warehouse_assigned_id VARCHAR(32) REFERENCES warehouses(id) ON DELETE RESTRICT,
    
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    services_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    
    order_status VARCHAR(64) NOT NULL DEFAULT 'new_pending_manager',
    manager_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_order_status CHECK (
        order_status IN (
            'new_pending_manager', 'measurement_scheduled', 'measured_confirmed',
            'stock_reserved', 'factory_ordered', 'ready_for_shipping', 'completed', 'cancelled'
        )
    )
);

-- ============================================================================
-- 15. СТРОКИ ЗАКАЗА (ORDER_ITEMS)
-- Синхронизировано: полный перечень item_kind включая wc_turn, h_beam, escutcheon
-- ============================================================================
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- ЯВНЫЕ ССЫЛКИ В МОМЕНТ СОЗДАНИЯ:
    variant_id VARCHAR(64) NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    molding_id VARCHAR(64) NULL REFERENCES molding_items(id) ON DELETE RESTRICT,
    hardware_variant_id VARCHAR(64) NULL REFERENCES hardware_variants(id) ON DELETE RESTRICT,
    supplier_id VARCHAR(64) NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    
    -- Полный обновленный классификатор типов позиций:
    item_kind VARCHAR(32) NOT NULL,
    
    -- НЕИЗМЕНЯЕМЫЕ ЗАМОРОЖЕННЫЕ СНИМКИ:
    name_snapshot VARCHAR(255) NOT NULL,
    variant_params_snapshot JSONB NOT NULL,
    supplier_name_snapshot VARCHAR(255) NOT NULL,
    supplier_sku_snapshot VARCHAR(100),
    
    unit_price_snapshot NUMERIC(10,2) NOT NULL,
    purchase_price_snapshot NUMERIC(10,2) NULL,
    quantity NUMERIC(6,2) NOT NULL,
    unit VARCHAR(16) NOT NULL DEFAULT 'pc',
    subtotal NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_order_item_single_target CHECK (
        num_nonnulls(variant_id, molding_id, hardware_variant_id) = 1
    ),
    CONSTRAINT chk_order_item_kind CHECK (
        item_kind IN (
            'door_leaf', 'frame', 'casing', 'extension', 'h_beam',
            'hinge', 'lock', 'handle', 'wc_turn', 'escutcheon',
            'monolithic_block', 'invisible_kit'
        )
    ),
    CONSTRAINT chk_order_item_qty CHECK (quantity > 0),
    CONSTRAINT chk_order_item_subtotal CHECK (subtotal = ROUND(unit_price_snapshot * quantity, 2))
);

-- ============================================================================
-- 16. СЕРВИСНЫЕ УСЛУГИ (ORDER_SERVICES)
-- Синхронизировано: полный утвержденный перечень 14 кодов услуг
-- ============================================================================
CREATE TABLE order_services (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    price_snapshot NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_service_type CHECK (
        service_type IN (
            'measurement',
            'delivery_city', 'delivery_suburb',
            'floor_carry_elevator', 'floor_carry_stairs',
            'dismantling_interior', 'dismantling_metal',
            'installation_interior', 'installation_extension', 'installation_invisible', 'installation_metal',
            'debris_disposal',
            'extra_wall_expansion', 'extra_leaf_trim'
        )
    ),
    CONSTRAINT chk_service_subtotal CHECK (subtotal = ROUND(price_snapshot * quantity, 2))
);

-- ============================================================================
-- 17. ИНДЕКСЫ
-- ============================================================================
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_published ON products(is_published) WHERE is_published = TRUE;
CREATE INDEX idx_products_pricing_type ON products(pricing_type);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);

CREATE INDEX idx_stock_warehouse ON stock_items(warehouse_id);
CREATE INDEX idx_stock_variant ON stock_items(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX idx_stock_molding ON stock_items(molding_id) WHERE molding_id IS NOT NULL;
CREATE INDEX idx_stock_hardware ON stock_items(hardware_variant_id) WHERE hardware_variant_id IS NOT NULL;
CREATE INDEX idx_stock_status ON stock_items(stock_status);

CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_city ON orders(customer_city);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================================
-- 18. ТРИГГЕРЫ И ПРОЦЕДУРЫ
-- ============================================================================

-- А) Обновление временных меток updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brands_updated BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_stock_updated BEFORE UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Б) Автоматический пересчет итогов заказа
CREATE OR REPLACE FUNCTION recalc_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id INT;
    v_items_sum NUMERIC(10,2);
    v_services_sum NUMERIC(10,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;

    SELECT COALESCE(SUM(subtotal), 0.00) INTO v_items_sum FROM order_items WHERE order_id = v_order_id;
    SELECT COALESCE(SUM(subtotal), 0.00) INTO v_services_sum FROM order_services WHERE order_id = v_order_id;

    UPDATE orders
    SET total_amount = v_items_sum,
        services_amount = v_services_sum,
        grand_total = v_items_sum + v_services_sum
    WHERE id = v_order_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_recalc AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION recalc_order_totals();

CREATE TRIGGER trg_order_services_recalc AFTER INSERT OR UPDATE OR DELETE ON order_services
    FOR EACH ROW EXECUTE FUNCTION recalc_order_totals();

-- В) ЗАЩИТА ПОДТВЕРЖДЕННЫХ ЗАКАЗОВ ОТ ИЗМЕНЕНИЙ (IMMUTABILITY PROTECTION)
-- Блокирует добавление (INSERT), изменение (UPDATE) и удаление (DELETE) позиций, если заказ переведен в статус резерва и далее
CREATE OR REPLACE FUNCTION protect_confirmed_orders()
RETURNS TRIGGER AS $$
DECLARE
    v_order_status VARCHAR(64);
    v_order_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;

    SELECT order_status INTO v_order_status FROM orders WHERE id = v_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Заказ №% не найден', v_order_id;
    END IF;

    -- Запрет модификации подтвержденных заказов (блокирует INSERT, UPDATE и DELETE)
    IF v_order_status IN ('stock_reserved', 'factory_ordered', 'ready_for_shipping', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'Заказ №% зафиксирован в статусе "%". Добавление (INSERT), изменение (UPDATE) и удаление (DELETE) строк запрещены!',
            v_order_id, v_order_status;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_protect BEFORE INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION protect_confirmed_orders();

CREATE TRIGGER trg_order_services_protect BEFORE INSERT OR UPDATE OR DELETE ON order_services
    FOR EACH ROW EXECUTE FUNCTION protect_confirmed_orders();

-- Ж) ЗАЩИТА ОТ ОБХОДА БЛОКИРОВКИ ЧЕРЕЗ ОТКАТ СТАТУСА РОДИТЕЛЬСКОГО ЗАКАЗА
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Если заказ уже зафиксирован (резерв или далее), запрещено возвращать его в черновик
    IF OLD.order_status IN ('stock_reserved', 'factory_ordered', 'ready_for_shipping', 'completed', 'cancelled')
       AND NEW.order_status IN ('new_pending_manager', 'measurement_scheduled') THEN
        RAISE EXCEPTION 'Недопустимый откат статуса заказа №% из "%" в "%"! Защита истории заказов от модификации.',
            OLD.id, OLD.order_status, NEW.order_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_status_transition BEFORE UPDATE OF order_status ON orders
    FOR EACH ROW EXECUTE FUNCTION validate_order_status_transition();

-- Г) Автоматическое поддержание физического статуса склада
CREATE OR REPLACE FUNCTION sync_stock_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.stock_status = CASE 
        WHEN (NEW.stock_qty - NEW.reserved_qty) > 0 THEN 'in_stock'
        WHEN NEW.stock_qty > 0 AND (NEW.stock_qty - NEW.reserved_qty) = 0 THEN 'reserved'
        ELSE 'out_of_stock'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_status_sync BEFORE INSERT OR UPDATE ON stock_items
    FOR EACH ROW EXECUTE FUNCTION sync_stock_status();

-- Д) Процедура транзакционного резервирования остатка
CREATE OR REPLACE FUNCTION reserve_stock_item(
    p_warehouse_id VARCHAR(32),
    p_variant_id VARCHAR(64),
    p_molding_id VARCHAR(64),
    p_hardware_variant_id VARCHAR(64),
    p_qty INT
) RETURNS BOOLEAN AS $$
DECLARE
    v_stock_record stock_items%ROWTYPE;
BEGIN
    IF p_qty <= 0 THEN
        RAISE EXCEPTION 'Количество для резерва должно быть строго больше 0';
    END IF;

    SELECT * INTO v_stock_record
    FROM stock_items
    WHERE warehouse_id = p_warehouse_id
      AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
      AND (molding_id = p_molding_id OR (molding_id IS NULL AND p_molding_id IS NULL))
      AND (hardware_variant_id = p_hardware_variant_id OR (hardware_variant_id IS NULL AND p_hardware_variant_id IS NULL))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Запись склада не найдена для склада %', p_warehouse_id;
    END IF;

    IF (v_stock_record.stock_qty - v_stock_record.reserved_qty) < p_qty THEN
        RAISE EXCEPTION 'Недостаточно остатка на складе %: доступно %, запрошено %',
            p_warehouse_id, (v_stock_record.stock_qty - v_stock_record.reserved_qty), p_qty;
    END IF;

    UPDATE stock_items
    SET reserved_qty = reserved_qty + p_qty
    WHERE id = v_stock_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Е) Процедура снятия брони
CREATE OR REPLACE FUNCTION release_stock_reserve(
    p_warehouse_id VARCHAR(32),
    p_variant_id VARCHAR(64),
    p_molding_id VARCHAR(64),
    p_hardware_variant_id VARCHAR(64),
    p_qty INT
) RETURNS BOOLEAN AS $$
DECLARE
    v_stock_record stock_items%ROWTYPE;
BEGIN
    IF p_qty <= 0 THEN
        RAISE EXCEPTION 'Количество для снятия брони должно быть больше 0';
    END IF;

    SELECT * INTO v_stock_record
    FROM stock_items
    WHERE warehouse_id = p_warehouse_id
      AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
      AND (molding_id = p_molding_id OR (molding_id IS NULL AND p_molding_id IS NULL))
      AND (hardware_variant_id = p_hardware_variant_id OR (hardware_variant_id IS NULL AND p_hardware_variant_id IS NULL))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Запись склада не найдена';
    END IF;

    IF v_stock_record.reserved_qty < p_qty THEN
        RAISE EXCEPTION 'Попытка снять резерв (%) больше фактической брони (%)', p_qty, v_stock_record.reserved_qty;
    END IF;

    UPDATE stock_items
    SET reserved_qty = reserved_qty - p_qty
    WHERE id = v_stock_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```
