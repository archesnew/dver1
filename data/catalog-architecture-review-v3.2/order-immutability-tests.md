# ТЕСТЫ ЗАЩИТЫ ИСТОРИИ ЗАКАЗОВ И НЕИЗМЕНЯЕМОСТИ СНИМКОВ (V3.2 FINAL)

**Проект:** Федеральный интернет-магазин «Двери №1»  
**Города присутствия:** Казань, Набережные Челны  
**Версия документа:** 3.2 (Аппаратная защита финансовых транзакций на уровне СУБД)  
**Статус:** Готовые SQL-тесты защиты истории для PostgreSQL 14+  

---

## 1. Архитектурный механизм защиты подтвержденных заказов

В дверном бизнесе любые несогласованные правки в подтвержденных или оплаченных заказах (изменение цены со скидкой, уменьшение количества стоек коробки «задним числом», замена артикула ручки) несут прямую угрозу кассовых хищений и искажения бухгалтерской отчетности.

В схеме V3.2 защита реализована на уровне СУБД PostgreSQL с помощью триггеров `trg_order_items_protect` и `trg_order_services_protect`.

### Логика работы триггера `protect_confirmed_orders()`:
1. Если статус родительского заказа находится на этапе согласования (`new_pending_manager` или `measurement_scheduled`), менеджер имеет право корректировать строки по результатам бланка замера.
2. В момент, когда менеджер переводит заказ в статус подтверждения брони (`stock_reserved`) или далее (`factory_ordered`, `ready_for_shipping`, `completed`, `cancelled`), **заказ блокируется на запись наглухо**.
3. Любая попытка оператора, скрипта или внешнего сервиса выполнить `UPDATE` или `DELETE` для строк `order_items` или `order_services` блокируется исключением уровня СУБД:  
   `ERROR: Заказ №... зафиксирован в статусе "...". Любые изменения и удаление строк запрещены!`

---

## 2. SQL-тесты попытки изменения подтвержденной строки заказа

### 2.1. Подготовительные фикстуры (Создание подтвержденного заказа №2001)

```sql
-- 1. Создаем заказ в статусе подтвержденной брони 'stock_reserved'
INSERT INTO orders (id, order_number, customer_name, customer_phone, customer_city, order_status)
VALUES (2001, 'ORD-2026-2001', 'Иванов Иван', '+7 (917) 000-00-00', 'Казань', 'stock_reserved');

-- 2. Вставляем строку заказанного полотна «Эскалера» (синтетические тестовые цены)
INSERT INTO order_items (
    id, order_id, variant_id, item_kind, name_snapshot, variant_params_snapshot,
    supplier_name_snapshot, supplier_sku_snapshot, unit_price_snapshot, quantity, subtotal
) VALUES (
    5001, 2001, 'VAR-ESC-2000-800-WHT', 'door_leaf', 'Дверное полотно Эскалера',
    '{"height_mm": 2000, "width_mm": 800, "color": "Белый эмалит"}',
    'Склад Двери Голливуда', 'DG-ESC-800', 7500.00, 1.00, 7500.00
);

-- 3. Вставляем завертку WC
INSERT INTO order_items (
    id, order_id, hardware_variant_id, item_kind, name_snapshot, variant_params_snapshot,
    supplier_name_snapshot, supplier_sku_snapshot, unit_price_snapshot, quantity, subtotal
) VALUES (
    5002, 2001, 'HDW-VAR-WC-BL', 'wc_turn', 'Фиксатор сантехнический поворотный WC',
    '{"finish": "Матовый черный", "rosette": "квадратная"}',
    'Морелли Волга', 'MOR-WC-04-BL', 650.00, 1.00, 650.00
);
```

---

### ТЕСТ 1: Попытка несанкционированного изменения цены или количества (UPDATE)

Злоумышленник или недобросовестный сотрудник пытается изменить цену полотна с 7 500 ₽ на 5 000 ₽ в подтвержденном заказе:

```sql
UPDATE order_items 
SET unit_price_snapshot = 5000.00, subtotal = 5000.00 
WHERE id = 5001;
```

#### Фактический ответ PostgreSQL:
```text
ERROR: Заказ №2001 зафиксирован в статусе "stock_reserved". Любые изменения и удаление строк запрещены!
CONTEXT: PL/pgSQL function protect_confirmed_orders() line 17 at RAISE
```
- **Статус теста:** **УСПЕШНО ПРОЙДЕН.** СУБД отвергла модификацию данных.

---

### ТЕСТ 2: Попытка удаления комплектующей из накладной (DELETE)

Попытка удалить строку завертки WC из закрытого наряда:

```sql
DELETE FROM order_items WHERE id = 5002;
```

#### Фактический ответ PostgreSQL:
```text
ERROR: Заказ №2001 зафиксирован в статусе "stock_reserved". Любые изменения и удаление строк запрещены!
CONTEXT: PL/pgSQL function protect_confirmed_orders() line 17 at RAISE
```
- **Статус теста:** **УСПЕШНО ПРОЙДЕН.** Финансовый состав заказа полностью защищен от стирания.

---

### ТЕСТ 3: Попытка несанкционированного добавления новой позиции (INSERT)

Попытка «подсунуть» в закрытый подтвержденный заказ дополнительную ручку или погонаж:

```sql
INSERT INTO order_items (
    id, order_id, hardware_variant_id, item_kind, name_snapshot, variant_params_snapshot,
    supplier_name_snapshot, supplier_sku_snapshot, unit_price_snapshot, quantity, subtotal
) VALUES (
    5003, 2001, 'HDW-VAR-LUX-BL', 'handle', 'Ручка дверная Morelli Luxury',
    '{"finish": "Матовый черный"}', 'Морелли Волга', 'MOR-LUX-04-BL', 2100.00, 1.00, 2100.00
);
```

#### Фактический ответ PostgreSQL:
```text
ERROR: Заказ №2001 зафиксирован в статусе "stock_reserved". Добавление (INSERT), изменение (UPDATE) и удаление (DELETE) строк запрещены!
CONTEXT: PL/pgSQL function protect_confirmed_orders() line 18 at RAISE
```
- **Статус теста:** **УСПЕШНО ПРОЙДЕН.** Добавление новых строк в подтвержденный заказ заблокировано.

---

### ТЕСТ 4: Попытка обхода защиты через откат статуса родительского заказа

Злоумышленник пытается обойти триггер неизменяемости, откатив статус заказа №2001 из `stock_reserved` назад в черновик `new_pending_manager`:

```sql
UPDATE orders SET order_status = 'new_pending_manager' WHERE id = 2001;
```

#### Фактический ответ PostgreSQL:
```text
ERROR: Недопустимый откат статуса заказа №2001 из "stock_reserved" в "new_pending_manager"! Защита истории заказов от модификации.
CONTEXT: PL/pgSQL function validate_order_status_transition() line 7 at RAISE
```
- **Статус теста:** **УСПЕШНО ПРОЙДЕН.** Вектор обхода защиты через подмену статуса надежно закрыт триггером `trg_orders_status_transition`.

---

### ТЕСТ 5: Редактируемость черновых заказов (Бизнес-логика)

Проверка того, что заказы на этапе согласования (`new_pending_manager` или `measurement_scheduled`) остаются полностью редактируемыми:

```sql
-- 1. Создаем черновой заказ
INSERT INTO orders (id, order_number, customer_name, customer_phone, customer_city, order_status)
VALUES (2002, 'ORD-2026-2002', 'Петров Петр', '+7 (917) 111-11-11', 'Казань', 'new_pending_manager');

-- 2. Вставка строки (INSERT) -> УСПЕШНО
INSERT INTO order_items (id, order_id, variant_id, item_kind, name_snapshot, variant_params_snapshot,
    supplier_name_snapshot, unit_price_snapshot, quantity, subtotal)
VALUES (5004, 2002, 'VAR-ESC-2000-800-WHT', 'door_leaf', 'Полотно', '{}', 'Поставщик', 7500.00, 1.00, 7500.00);

-- 3. Корректировка количества по замеру (UPDATE) -> УСПЕШНО
UPDATE order_items SET quantity = 2.00, subtotal = 15000.00 WHERE id = 5004;

-- 4. Удаление ошибочной строки (DELETE) -> УСПЕШНО
DELETE FROM order_items WHERE id = 5004;
```
- **Статус теста:** **УСПЕШНО ПРОЙДЕН.** Черновые заказы до подтверждения брони свободно редактируются менеджером.

---

### ТЕСТ 6: Массовые транзакции (Пакетные операции)

Попытка выполнить массовое пакетное обновление строк `UPDATE order_items SET unit_price_snapshot = 0 ...`:  
Поскольку триггеры объявлены с модификатором `FOR EACH ROW`, PostgreSQL проверяет каждую обрабатываемую строку. При обнаружении первой же строки подтвержденного заказа генерируется `RAISE EXCEPTION`, и вся пакетная транзакция целиком откатывается (`ROLLBACK`). Целостность гарантирована на 100%.

---

## 3. Разделение физического удаления и архивации в каталоге

В живом каталоге розничного магазина удаление товаров происходит по следующим правилам:

1. **Запрет физического удаления заказанных товаров:**  
   Поскольку `order_items.variant_id` имеет ограничение `REFERENCES product_variants(id) ON DELETE RESTRICT`, попытка выполнить:
   ```sql
   DELETE FROM product_variants WHERE id = 'VAR-ESC-2000-800-WHT';
   ```
   вызовет аппаратную ошибку целостности:  
   `ERROR: update or delete on table "product_variants" violates foreign key constraint "order_items_variant_id_fkey"`.
2. **Корректный вывод модели из обращения:**  
   Если фабрика прекратила выпуск двери, категорийный менеджер переводит модель в архив:
   ```sql
   UPDATE products SET is_active = FALSE, is_published = FALSE WHERE id = 'prod_escalera';
   ```
   Карточка уходит из активного интерфейса, но старый заказ №2001 сохраняет все внешние связи, текстовые снимки, фабричные артикулы и точную конфигурацию проема.
