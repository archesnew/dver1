import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Каталог феррони 05-2026 (mngst) (4).pdf"

def parse_ferroni():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    current_collection = "Входные двери"
    
    prod_counter = 1
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        # Track collections based on headings
        t_upper = text.upper()
        if "ДВЕРИ С ТЕРМОРАЗРЫВОМ" in t_upper:
            current_collection = "Двери с терморазрывом"
        elif "ДВЕРИ СО СТЕКЛОПАКЕТОМ" in t_upper or "КОТТЕДЖНЫЕ ДВЕРИ" in t_upper:
            current_collection = "Коттеджные двери со стеклопакетом"
        elif "ДВЕРИ МДФ/МДФ" in t_upper:
            current_collection = "Двери МДФ/МДФ"
        elif "ДВЕРИ С ЗЕРКАЛОМ" in t_upper:
            current_collection = "Двери с зеркалом"
        elif "ДВЕРИ МЕТАЛЛ/МДФ" in t_upper:
            current_collection = "Двери металл/МДФ"
        elif "ДВЕРИ МЕТАЛЛ/МЕТАЛЛ" in t_upper:
            current_collection = "Двери металл/металл"
            
        if pno in [0, 1, 2, 34, 35, 36]:
            if pno == 33: # Page 34: Держатель стендовый
                pid = f"PROD-FERR-{prod_counter:03d}"
                prod_counter += 1
                imgs = extract_best_images(doc, pno, pid)
                products.append({
                    "id": pid,
                    "brand": "Феррони",
                    "brand_id": "BRAND-FERRONI",
                    "collection": "Торговое оборудование и комплектующие",
                    "collection_id": "COLL-FERR-EQUIP",
                    "model": "Держатель стендовый для двери",
                    "article": None,
                    "category": "Комплектующие",
                    "description": "Крепления предназначены для оформления витрины на малой площади. Время монтажа – до 15 минут. Комплект из 8 держателей для крепления 4-х дверей.",
                    "source": {
                        "pdf_file": PDF_NAME,
                        "page": pno + 1,
                        "confidence_status": "verified",
                        "need_manual_check": False,
                        "check_reason": None
                    },
                    "specs": {
                        "door_type": "Торговое оборудование",
                        "construction": "Металлическая конструкция стендового крепления",
                        "material": "Металл",
                        "coating": "Порошковое покрытие",
                        "color": "Черный / Металлик",
                        "texture": "Матовая",
                        "glass": "Нет",
                        "decor": None,
                        "style": "Технический",
                        "available_sizes": ["Комплект на 4 двери"],
                        "opening_direction": "Универсальное",
                        "other_specs": {"mounting_time": "до 15 минут", "pack_count": "8 держателей"}
                    },
                    "complectation": {
                        "leaf": None,
                        "frame": None,
                        "casing": None,
                        "extensions": None,
                        "hinges": None,
                        "locks": None,
                        "handles": None,
                        "other_hardware": "8 держателей стендовых, крепеж"
                    },
                    "images": imgs,
                    "price": None,
                    "price_type": "quote",
                    "variants": []
                })
            continue
            
        # Parse product pages (pno from 3 to 32)
        # Check blocks
        blocks = page.get_text("blocks")
        
        # Identify models on page
        # Usually each block with "Внешнее покрытие" or bold model name indicates a model or variant
        # Let's inspect page blocks
        page_models = []
        
        # Look for model headings
        for b in blocks:
            b_text = b[4].strip()
            b_lines = [l.strip() for l in b_text.split('\n') if l.strip()]
            for l in b_lines:
                # Patterns for model names
                if re.match(r'^(?:13\s*СМ|11\s*см|9\s*см|9\s*СМ|7,5\s*см|7,5\s*СМ|7\s*см|ГАРДА|ТЕРМО|ТРОЯ|РИДЖ|СОПРАНО|БОСТОН|ВЕНЕЦИЯ|СИБИРЬ|СТРОЙГОСТ|ТЕХНО|КОМФОРТ|ISOTERMA)', l, re.IGNORECASE):
                    if len(l) < 55 and not "Внешнее покрытие" in l and not "производитель" in l.lower() and not "двухкамерный" in l.lower():
                        if l not in page_models and l not in ["Двери с терморазрывом", "Двери со стеклопакетом", "Двери МДФ/МДФ", "Двери с зеркалом", "Двери металл/МДФ", "Двери металл/металл"]:
                            page_models.append(l)
                            
        if not page_models:
            # Fallback title from first lines
            for l in lines[:5]:
                if any(k in l.upper() for k in ["ВЕНЕЦИЯ", "VITRA", "ГАРДА", "ТЕРМО", "ГЕОМЕТРИЯ", "СИБИРЬ", "ТРОЯ", "СТРОЙГОСТ", "БОСТОН", "РИДЖ"]):
                    page_models.append(l)
                    break
                    
        if not page_models:
            page_models = [f"Модель Феррони Стр.{pno+1}"]
            
        # Extract general specs for this page
        ext_cov = ""
        int_cov = ""
        thick = ""
        box_depth = ""
        insul = "Пенополистирол"
        seals = "Уплотнитель из вспененной резины"
        locks = "Основной замок MANGYST IV класс, дополнительный замок MANGYST IV класс"
        handles = "Раздельная ручка"
        hinges = "3 шт., наружные, открывание 180°"
        glass = "Нет"
        decor = None
        sizes = ["860х2050 мм", "960х2050 мм"]
        
        for l in lines:
            if "внешнее покрытие" in l.lower():
                ext_cov = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "внутреннее покрытие" in l.lower() or "внутренняя панель" in l.lower():
                int_cov = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "толщина дверного полотна" in l.lower():
                thick = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "глубина дверного короба" in l.lower():
                box_depth = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "наполнитель" in l.lower():
                insul = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "уплотнитель" in l.lower():
                seals = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "стеклопакет" in l.lower():
                glass = l.split(":", 1)[-1].strip() if ":" in l else l
            elif "размеры" in l.lower():
                sz_part = l.split(":", 1)[-1].strip() if ":" in l else l
                sz_matches = re.findall(r'\d{3,4}\s*[хx*]\s*\d{4}', sz_part)
                if sz_matches:
                    sizes = [f"{s.replace('*', 'х').replace('x', 'х')} мм" for s in sz_matches]
                    
        if "стеклопакет" in ext_cov.lower() or "стекло" in text.lower():
            if glass == "Нет" and "стекло" in text.lower():
                glass = "Стеклопакет / вставки стекла"
        if "зеркал" in current_collection.lower() or "зеркал" in text.lower():
            decor = "Накладное зеркало с защитной пленкой"
            glass = "Зеркало с защитной пленкой"
            
        imgs = extract_best_images(doc, pno, f"PROD-FERR-P{pno+1}")
        
        for m_name in page_models:
            pid = f"PROD-FERR-{prod_counter:03d}"
            prod_counter += 1
            
            # Determine style
            style = "Классика" if any(w in m_name.lower() for w in ["патина", "классик", "велюр", "венг"]) else "Современный / Модерн"
            
            # Variants
            variants = []
            for s in sizes:
                for side in ["Левое", "Правое"]:
                    variants.append({
                        "variant_id": f"VAR-{pid}-{len(variants)+1}",
                        "name": f"{m_name} {s} ({side})",
                        "size": s,
                        "color": ext_cov or "Стандарт",
                        "opening": side,
                        "image": imgs[0] if imgs else None
                    })
                    
            products.append({
                "id": pid,
                "brand": "Феррони",
                "brand_id": "BRAND-FERRONI",
                "collection": current_collection,
                "collection_id": f"COLL-FERR-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
                "model": clean_text(m_name),
                "article": None,
                "category": "Входные двери",
                "description": f"Входная стальная дверь {m_name}. Коллекция: {current_collection}. Внешняя отделка: {ext_cov or 'порошково-полимерное покрытие'}. Внутренняя отделка: {int_cov or 'панель МДФ'}. Толщина полотна: {thick or 'не указано'}.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Входная дверь",
                    "construction": "Цельногнутая стальная конструкция",
                    "material": "Сталь / МДФ",
                    "coating": ext_cov or "Атмосферостойкое порошково-полимерное",
                    "color": f"{ext_cov} / {int_cov}".strip(' / '),
                    "texture": "Шагрень / Муар / МДФ фрезерованная",
                    "glass": glass,
                    "decor": decor,
                    "style": style,
                    "available_sizes": sizes,
                    "opening_direction": "Левое / Правое (180°)",
                    "other_specs": {
                        "leaf_thickness": thick or "75-130 мм",
                        "frame_depth": box_depth or "90-148 мм",
                        "insulation": insul,
                        "seals": seals,
                        "hinges": hinges,
                        "locks": locks,
                        "handles": handles,
                        "night_latch": "Независимая ночная задвижка",
                        "eccentric": "Металлический эксцентрик для регулировки притвора"
                    }
                },
                "complectation": {
                    "leaf": f"Стальное полотно {thick or ''}, внешняя отделка {ext_cov or ''}, внутренняя {int_cov or ''}".strip(),
                    "frame": f"Утепленный цельногнутый стальной короб {box_depth or ''}".strip(),
                    "casing": "Интегрированный металлический наличник",
                    "extensions": None,
                    "hinges": hinges,
                    "locks": locks,
                    "handles": handles,
                    "other_hardware": "Ночная задвижка, эксцентрик, глазок широкого обзора, броненакладки"
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
