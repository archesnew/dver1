import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Каталог_межкомнатных_дверей_2026_3.pdf"

def parse_mezhkomnatnye():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    current_collection = "Межкомнатные двери 2026"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno == 0 or pno == 31: # Cover or back
            continue
            
        imgs = extract_best_images(doc, pno, f"PROD-MEZH-P{pno+1}")
        
        # Collection tracking
        t_upper = text.upper()
        if "ДВЕРИ СКРЫТОГО МОНТАЖА" in t_upper:
            current_collection = "Двери скрытого монтажа"
        elif "ЦАРГОВАЯ" in t_upper or "ЦАРГОВЫЕ" in t_upper:
            current_collection = "Царговые двери"
        elif "ЭМАЛЬ" in t_upper:
            current_collection = "Коллекция Эмаль PRO"
        elif "КАРКАСНО-ЩИТОВАЯ" in t_upper:
            current_collection = "Каркасно-щитовые двери"
            
        # Model detection
        models_on_page = []
        for l in lines:
            if re.match(r'^(?:ДС-\d+|Li-\d+|Тибет|Ода|Урбан\s*\d+|Нова|Альдо\s*\d+|AL\s*\d+|М\d+|МО\d+|L\d+|VALEТTA|VALETTA)', l):
                if l not in models_on_page:
                    models_on_page.append(l)
                    
        if not models_on_page:
            models_on_page = [f"{current_collection} Стр.{pno+1}"]
            
        is_hidden = "скрытого" in current_collection.lower()
        category = "Скрытые двери" if is_hidden else "Межкомнатные двери"
        
        coating = "ПЭТ" if "пэт" in text.lower() else ("Эмаль" if "эмаль" in text.lower() else ("ПВХ" if "пвх" in text.lower() else ("HartWood" if "hartwood" in text.lower() else "Полипропилен")))
        construction = "Каркасно-щитовая конструкция" if "щитовая" in text.lower() else ("Царговая конструкция (стоевые сосна + фанера + МДФ)" if "царгов" in text.lower() else "Каркасно-щитовая")
        glass = "Стекло сатин / черное стекло Лакобель" if "стекло" in text.lower() or "сатин" in text.lower() or "лакобель" in text.lower() else "Глухое полотно"
        
        sizes = ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]
        
        for m in models_on_page:
            pid = f"PROD-MEZH-{prod_counter:03d}"
            prod_counter += 1
            
            variants = []
            for s in sizes:
                variants.append({
                    "variant_id": f"VAR-{pid}-{len(variants)+1}",
                    "name": f"{m} {s}",
                    "size": s,
                    "color": coating,
                    "opening": "Универсальное",
                    "image": imgs[0] if imgs else None
                })
                
            products.append({
                "id": pid,
                "brand": "Фабрика Межкомнатных Дверей",
                "brand_id": "BRAND-MEZH-DOORS",
                "collection": current_collection,
                "collection_id": f"COLL-MEZH-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
                "model": m,
                "article": None,
                "category": category,
                "description": f"Межкомнатная дверь {m}. Коллекция: {current_collection}. Конструкция: {construction}. Покрытие: {coating}. Толщина полотна: 38 мм.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Скрытая дверь" if is_hidden else "Межкомнатная дверь",
                    "construction": construction,
                    "material": "МДФ / сосновый брус",
                    "coating": coating,
                    "color": "Бьянка / Айс / Крим / Санторини / Платина / Белый / Дуб дымчатый",
                    "texture": "Матовая / древесная фактура / гладкая эмаль",
                    "glass": glass,
                    "decor": "Алюминиевая кромка ABS черная / хром, композитная заливка",
                    "style": "Современный / Минимализм / Неоклассика",
                    "available_sizes": sizes,
                    "opening_direction": "Универсальное (Direct / Reverse)",
                    "other_specs": {
                        "thickness": "38 мм",
                        "edge": "Кромка ABS с 4-х сторон черного цвета или алюминиевая кромка (для скрытых)",
                        "stiles": "Вертикальные стоевые - заполнение сосновым брусом + фанера + МДФ (бескромочная технология)"
                    }
                },
                "complectation": {
                    "leaf": "Дверное полотно 38 мм с заводской врезкой или без врезки",
                    "frame": "Алюминиевый скрытый короб (хром/черный) 2.5 шт. или телескопический короб МДФ",
                    "casing": "Без наличников (для скрытых) или телескопические плоские наличники",
                    "extensions": "Телескопические доборы 100/150 мм",
                    "hinges": "Две скрытые петли 180 градусов (хром/черный)",
                    "locks": "Врезка под магнитный замок",
                    "handles": "Приобретаются отдельно",
                    "other_hardware": "Ответная планка короба"
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
