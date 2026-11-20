# СКЛАДСКАЯ МОДЕЛЬ, РЕЗЕРВИРОВАНИЕ И МУЛЬТИСКЛАДСКОЙ УЧЕТ (V3 FINAL)

**Проект:** Федеральный интернет-магазин «Двери №1»  
**Города присутствия:** Казань (Сибирский тракт, 59б), Набережные Челны (Казанский проспект, 232)  
**Версия документа:** 3.0 (Финальная ревизия транзакционной безопасности складского контура)  
**Статус:** Утверждено для проектирования складских сервисов и интеграции с 1С/МойСклад  

---

## 1. Ликвидация псевдополиморфного ключа и гарантия ссылочной целостности

В версии V2 складские остатки хранились через пару `item_type VARCHAR(32) + item_id VARCHAR(64)`. Это создавало критический риск рассинхронизации: СУБД не могла проверить наличие родительского товара.

### Архитектурное решение V3: Взаимоисключающие типизированные внешние ключи (Exclusive Arc)

```sql
CREATE TABLE stock_items (
    id SERIAL PRIMARY KEY,
    warehouse_id VARCHAR(32) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    
    -- ЯВНЫЕ ВНЕШНИЕ КЛЮЧИ:
    variant_id VARCHAR(64) NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    molding_id VARCHAR(64) NULL REFERENCES molding_items(id) ON DELETE RESTRICT,
    hardware_variant_id VARCHAR(64) NULL REFERENCES hardware_variants(id) ON DELETE RESTRICT,
    
    stock_qty INT NOT NULL DEFAULT 0,
    reserved_qty INT NOT NULL DEFAULT 0,
    available_qty INT GENERATED ALWAYS AS (stock_qty - reserved_qty) STORED,
    
    stock_status VARCHAR(64) NOT NULL DEFAULT 'on_order_factory',
    manager_confirmation_required BOOLEAN NOT NULL DEFAULT TRUE,
    last_inventory_date TIMESTAMP WITH TIME ZONE NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- 1. Ссылочная целостность: ровно один внешний ключ обязан быть заполнен
    CONSTRAINT chk_stock_single_item CHECK (
        num_nonnulls(variant_id, molding_id, hardware_variant_id) = 1
    ),
    -- 2. Физическая безопасность: защита от отрицательного остатка и перерезервирования
    CONSTRAINT chk_stock_quantities CHECK (
        stock_qty >= 0 AND reserved_qty >= 0 AND reserved_qty <= stock_qty
    ),
    CONSTRAINT chk_stock_status_enum CHECK (
        stock_status IN ('in_stock', 'reserved', 'on_order_factory', 'out_of_stock')
    ),
    -- 3. Уникальность складской ячейки
    CONSTRAINT uq_warehouse_variant UNIQUE (warehouse_id, variant_id),
    CONSTRAINT uq_warehouse_molding UNIQUE (warehouse_id, molding_id),
    CONSTRAINT uq_warehouse_hardware UNIQUE (warehouse_id, hardware_variant_id)
);
```

**Результат внедрения:**  
База данных физически отвергнет любую попытку создать запись остатка для несуществующего размера двери, коробки или ручки. При попытке удалить товар из каталога СУБД сгенерирует ошибку `RESTRICT`, защищая складские остатки.

---

## 2. Изоляция складов Казани и Набережных Челнов

Склады компании изолированы географически и организационно:
1. **Склад «Казань» (`kazan_central`):** г. Казань, ул. Сибирский тракт, 59б.
2. **Склад «Набережные Челны» (`chelny_hub`):** г. Набережные Челны, Казанский проспект, 232.

```
                           ┌──────────────────────────────────────────────┐
                           │   Запрос наличия клиентом из г. Челны        │
                           └──────────────────────┬───────────────────────┘
                                                  │
                        ┌─────────────────────────┴────────────────────────┐
                        ▼                                                  ▼
          ┌───────────────────────────┐                      ┌───────────────────────────┐
          │    Склад в Челнах         │                      │    Склад в Казани         │
          │   (Казанский пр., 232)    │                      │   (Сибирский тракт, 59б)  │
          ├───────────────────────────┤                      ├───────────────────────────┤
          │ stock_qty = 0             │                      │ stock_qty = 8             │
          │ stock_status = 'on_order' │                      │ stock_status = 'in_stock' │
          └─────────────┬─────────────┘                      └─────────────┬─────────────┘
                        │                                                  │
                        ▼                                                  ▼
          ┌──────────────────────────────────────────────────────────────────────────────┐
          │ Статус на витрине для клиента из Набережных Челнов:                          │
          │ «В наличии на складе в Казани (перемещение в Челны 2-4 дня)»                │
          │ КАТЕГОРИЧЕСКИЙ ЗАПРЕТ: статус «В наличии сегодня в Челнах»                   │
          └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Модель остатков и соответствие статуса `stock_status`

### 3.1. Трехфакторный учет
- **$\mathbf{stock\_qty}$ (Физический остаток):** реальное количество полотен/погонажа на поддонах склада.
- **$\mathbf{reserved\_qty}$ (Зарезервировано):** забронировано под заказы клиентов, подтвержденные менеджером.
- **$\mathbf{available\_qty}$ (Доступно к продаже):** вычисляемое поле `stock_qty - reserved_qty`.

### 3.2. Автоматическая синхронизация статуса наличия

| Условие остатков | Статус в базе (`stock_status`) | Отображение в интерфейсе |
| :--- | :--- | :--- |
| `available_qty > 0` | `in_stock` | **«В наличии на складе»** |
| `stock_qty > 0 AND available_qty = 0` | `reserved` | **«Все единицы в резерве (уточняйте)»** |
| `stock_qty = 0 AND supplier_status = 'active'` | `on_order_factory` | **«Под заказ с фабрики (срок уточняется)»** |
| `stock_qty = 0 AND supplier_status = 'discontinued'` | `out_of_stock` | **«Товар снят с производства»** |

---

## 4. Транзакционная безопасность и защита от состояния гонки (Race Condition)

При одновременной работе нескольких менеджеров или одновременных заказах на сайте возникает риск параллельного резервирования одного и того же последнего полотна.

### 4.1. Процедура транзакционного резервирования (`reserve_stock_item`)

Использует строгую пессимистическую блокировку строки `SELECT ... FOR UPDATE`:

```sql
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
        RAISE EXCEPTION 'Количество для резервирования должно быть > 0';
    END IF;

    -- Блокировка строки на уровне PostgreSQL до завершения транзакции
    SELECT * INTO v_stock_record
    FROM stock_items
    WHERE warehouse_id = p_warehouse_id
      AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
      AND (molding_id = p_molding_id OR (molding_id IS NULL AND p_molding_id IS NULL))
      AND (hardware_variant_id = p_hardware_variant_id OR (hardware_variant_id IS NULL AND p_hardware_variant_id IS NULL))
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Запись склада не найдена для указанного товара';
    END IF;

    -- Проверка доступности свободного остатка
    IF (v_stock_record.stock_qty - v_stock_record.reserved_qty) < p_qty THEN
        RAISE EXCEPTION 'Ошибка резерва: доступно %, запрошено %', 
            (v_stock_record.stock_qty - v_stock_record.reserved_qty), p_qty;
    END IF;

    -- Увеличение брони
    UPDATE stock_items
    SET reserved_qty = reserved_qty + p_qty,
        stock_status = CASE 
            WHEN (stock_qty - (reserved_qty + p_qty)) = 0 THEN 'reserved'
            ELSE 'in_stock'
        END
    WHERE id = v_stock_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Протокол ручного подтверждения менеджером (Запрет автосписания)

> [!CRITICAL]
> **Категорический запрет автоматического списания остатков при нажатии кнопки в корзине:**  
> Флаг `manager_confirmation_required = TRUE` гарантирует, что оформление заказа покупателем создает заказ строго в статусе `new_pending_manager`. Никакие складские остатки не списываются и не блокируются автоматически!

### Почему автосписание недопустимо в дверном бизнесе:
1. **Ошибки замеров покупателей:** Покупатель заказывает полотно 800 мм, а после лазерного замера на объекте выясняется, что чистый проем всего 760 мм (требуется полотно 700 мм). Автосписание заблокировало бы чужой товар.
2. **Контроль производственной партии (разнотон):** Двери и погонаж должны отгружаться из одной партии выпуска. Сборка заказа требует физической проверки номеров партий кладовщиком.
3. **Снятие резерва:** Если клиент отказался от покупки или не внес предоплату в течение установленного регламентом срока (например, 72 часа), функция `release_stock_reserve()` возвращает зарезервированные единицы в статус свободной продажи (`in_stock`).
