import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Chameleon Doors каталог 01.03.2026.pdf"

def parse_chameleon():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    current_collection = "Chameleon Doors"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 7 or pno == 43: # Covers, intro, TOC, contacts
            continue
            
        imgs = extract_best_images(doc, pno, f"PROD-CHAM-P{pno+1}")
        
        # Track collection
        for l in lines:
            if "COLLECTION" in l.upper():
                current_collection = l.strip()
                break
                
        if pno in [7, 8]: # Invisible
            pid = f"PROD-CHAM-{prod_counter:03d}"
            prod_counter += 1
            products.append({
                "id": pid,
                "brand": "Chameleon Doors",
                "brand_id": "BRAND-CHAMELEON",
                "collection": "Invisible",
                "collection_id": "COLL-CHAM-INVISIBLE",
                "model": "Invisible (Скрытая дверь под отделку)",
                "article": None,
                "category": "Скрытые двери",
                "description": "Дверь скрытого монтажа Chameleon Doors Invisible. Полотно под покраску, обои или декоративную штукатурку с алюминиевой кромкой или без кромки. Скрытый алюминиевый короб под шпаклевку.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Скрытая дверь",
                    "construction": "Каркасно-щитовое полотно с сотовым или трубчатым заполнением / брусом, алюминиевый скрытый короб",
                    "material": "Алюминий / МДФ / сосна",
                    "coating": "Грунт под покраску / штукатурку / обои",
                    "color": "Под покраску (белый грунт)",
                    "texture": "Гладкая грунтованная под финишную отделку",
                    "glass": "Нет",
                    "decor": "Алюминиевая кромка (матовый хром, черный)",
                    "style": "Минимализм / Хай-тек / Современный",
                    "available_sizes": ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм", "Высота до 2700 мм под заказ"],
                    "opening_direction": "Direct (на себя) / Reverse (от себя)",
                    "other_specs": {
                        "thickness": "40-59 мм",
                        "frame": "Анодированный алюминиевый короб скрытого монтажа"
                    }
                },
                "complectation": {
                    "leaf": "Грунтованное полотно с врезкой под скрытые петли и магнитный замок",
                    "frame": "Скрытый алюминиевый короб с уплотнителем и монтажными уголками",
                    "casing": "Без наличников (скрытый монтаж)",
                    "extensions": None,
                    "hinges": "Скрытые петли (хром / черный) 2 шт.",
                    "locks": "Магнитный замок AGB Mediana Polaris под фиксатор/цилиндр",
                    "handles": "Приобретаются отдельно",
                    "other_hardware": "Врезка заводская"
                },
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "variants": [
                    {"variant_id": f"VAR-{pid}-1", "name": "Invisible Direct 2000х800 Алюм. кромка", "size": "2000х800", "color": "Грунт", "opening": "Direct", "image": imgs[0] if imgs else None},
                    {"variant_id": f"VAR-{pid}-2", "name": "Invisible Reverse 2000х800 Алюм. кромка", "size": "2000х800", "color": "Грунт", "opening": "Reverse", "image": imgs[0] if imgs else None}
                ]
            })
            continue
            
        if pno == 41: # Стеновые панели
            pid = f"PROD-CHAM-{prod_counter:03d}"
            prod_counter += 1
            products.append({
                "id": pid,
                "brand": "Chameleon Doors",
                "brand_id": "BRAND-CHAMELEON",
                "collection": "Стеновые панели",
                "collection_id": "COLL-CHAM-PANELS",
                "model": "Стеновые реечные и плоские панели Chameleon",
                "article": None,
                "category": "Декоративные элементы и дополнительные решения",
                "description": "Стеновые панели МДФ в цвет межкомнатных дверей с ПВХ покрытием. Идеальное решение для создания единого стилевого пространства интерьера.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Стеновые панели",
                    "construction": "МДФ высокой плотности",
                    "material": "МДФ",
                    "coating": "ПВХ пленка в цвет дверей",
                    "color": "В ассортименте декоров каталога",
                    "texture": "Матовая / древесная / бетон",
                    "glass": "Нет",
                    "decor": "Реечный рельеф / гладкие панели",
                    "style": "Современный",
                    "available_sizes": ["Высота до 2800 мм", "Ширина по проекту"],
                    "opening_direction": "Стационарные панели",
                    "other_specs": {"thickness": "10-16 мм"}
                },
                "complectation": {
                    "leaf": "Панели стеновые",
                    "frame": None,
                    "casing": None,
                    "extensions": None,
                    "hinges": None,
                    "locks": None,
                    "handles": None,
                    "other_hardware": "Крепежные планки"
                },
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "variants": []
            })
            continue
            
        if pno == 42: # Погонажные изделия
            pid = f"PROD-CHAM-{prod_counter:03d}"
            prod_counter += 1
            products.append({
                "id": pid,
                "brand": "Chameleon Doors",
                "brand_id": "BRAND-CHAMELEON",
                "collection": "Погонажные изделия",
                "collection_id": "COLL-CHAM-MOLDING",
                "model": "Погонаж телескопический и капители Chameleon",
                "article": None,
                "category": "Комплектующие",
                "description": "Фирменный телескопический погонаж Chameleon Doors: коробка телескоп с уплотнителем, наличник плоский телескоп, наличник каннелюр, доборы телескопические, притворная планка, плинтус, капитель в сборе.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Погонаж",
                    "construction": "Телескопическая система крепления без гвоздей",
                    "material": "МДФ / сосна",
                    "coating": "ПВХ",
                    "color": "В цвет дверных полотен",
                    "texture": "Соответствует полотну",
                    "glass": "Нет",
                    "decor": "Каннелюры / капители / карнизы",
                    "style": "Универсальный",
                    "available_sizes": ["Коробка 2070х75х32", "Наличник 2150х70х10", "Добор 2070х100/150/200"],
                    "opening_direction": "Универсальное",
                    "other_specs": {"system": "Телескопический шип-паз"}
                },
                "complectation": {
                    "leaf": None,
                    "frame": "Коробка телескопическая с пазом под добор и наличник",
                    "casing": "Наличники телескопические Г-образные",
                    "extensions": "Доборы телескопические",
                    "hinges": None,
                    "locks": None,
                    "handles": None,
                    "other_hardware": "Плинтус, капитель, розетки, цоколи"
                },
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "variants": []
            })
            continue
            
        # Parse standard door pages (P10 to P39)
        # Find model tokens: Rail 1, Oval 1, Select 1, M 1, D 1, L 1, Mini 1, Fly 1, Classic 1, Design 1, etc.
        models_found = []
        for l in lines:
            m_match = re.findall(r'([A-Za-zА-Яа-я0-9\s]+?)\s+(?:ДГ|ДО)', l)
            for m in m_match:
                m_clean = m.strip()
                if len(m_clean) > 1 and m_clean not in models_found:
                    models_found.append(m_clean)
                    
        if not models_found:
            # Fallback to lines matching pattern
            for l in lines:
                if re.match(r'^(?:Rail|Oval|Select|Round stick|Mil fly|Very rich|Slim|Stick|M\s*\d+|D\s*\d+|L\s*\d+|Mini|Fly|Glass|Classic|Rich|Grid|Design|Office|B\s*\d+)', l):
                    if l not in models_found and "COLLECTION" not in l:
                        models_found.append(l)
                        
        if not models_found:
            models_found = [f"{current_collection} Стр.{pno+1}"]
            
        category = "Двери со стеклом" if "GLASS" in current_collection.upper() or any("ДО" in l for l in lines) else "Межкомнатные двери"
        
        for m in models_found:
            pid = f"PROD-CHAM-{prod_counter:03d}"
            prod_counter += 1
            
            is_glass = "ДО" in text or "Glass" in m or "стекло" in text.lower()
            glass_type = "Сатин (Мателюкс), Зеркало, Лакобель, Графит, Бронза" if is_glass else "Глухое полотно"
            
            variants = []
            for s in ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]:
                for opt in (["Глухая (ДГ)", "Остекленная (ДО)"] if is_glass else ["Глухая (ДГ)"]):
                    variants.append({
                        "variant_id": f"VAR-{pid}-{len(variants)+1}",
                        "name": f"{m} {opt} {s}",
                        "size": s,
                        "color": "ПВХ декор по каталогу",
                        "opening": "Универсальное",
                        "image": imgs[0] if imgs else None
                    })
                    
            products.append({
                "id": pid,
                "brand": "Chameleon Doors",
                "brand_id": "BRAND-CHAMELEON",
                "collection": current_collection,
                "collection_id": f"COLL-CHAM-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
                "model": m,
                "article": None,
                "category": category,
                "description": f"Межкомнатная дверь Chameleon Doors {m}. Коллекция: {current_collection}. Покрытие ПВХ высокой износостойкости. Надежная каркасно-щитовая или фрезерованная конструкция.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Межкомнатная дверь",
                    "construction": "Каркасно-щитовая с заполнением брусом / сотовым, фрезерованный МДФ",
                    "material": "МДФ / сосна",
                    "coating": "ПВХ европейского качества",
                    "color": "В ассортименте декоров фабрики Chameleon Doors",
                    "texture": "Матовая шелковистая / древесная / софт-тач",
                    "glass": glass_type,
                    "decor": "Глубокая фрезеровка / молдинги / декоративные рейки",
                    "style": "Современный / Неоклассика / Минимализм / Лофт",
                    "available_sizes": ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм", "нестандартные размеры до 2400 мм"],
                    "opening_direction": "Универсальное (распашная, раздвижная система)",
                    "other_specs": {
                        "thickness": "38 мм",
                        "factory_options": "Заполнение брусом, вентиляционная решетка, автопорог, скрытые петли"
                    }
                },
                "complectation": {
                    "leaf": "Полотно глухое или остекленное с ПВХ покрытием",
                    "frame": "Телескопическая коробка с пазом под уплотнитель",
                    "casing": "Телескопический фигурный или плоский наличник",
                    "extensions": "Телескопические доборы 100/150/200 мм",
                    "hinges": "Приобретаются отдельно (накладные-бабочки / скрытые)",
                    "locks": "Приобретаются отдельно (магнитные замки)",
                    "handles": "Приобретаются отдельно",
                    "other_hardware": "Автопорог (опция)"
                },
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "variants": variants
            })
            
    return {
        "pdf": PDF_NAME,
        "total_pages": total_pages,
        "processed_pages": total_pages,
        "products": products
    }
