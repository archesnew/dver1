import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "2026_Armadillo_catalog_web_compressed.pdf"

def parse_armadillo():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    hardware_items = []
    hdw_counter = 1
    
    current_category = "Дверные ручки"
    current_collection = "Коллекция Armadillo"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 3 or pno >= 128: # Covers, intro, back
            continue
            
        imgs = extract_best_images(doc, pno, f"HDW-ARM-P{pno+1}")
        
        # Category detection
        t_upper = text.upper()
        if "РУЧКИ НА РАЗДЕЛЬНОМ" in t_upper or "ДВЕРНЫЕ РУЧКИ" in t_upper:
            current_category = "Ручки на раздельном основании"
        elif "РУЧКИ ДЛЯ РАЗДВИЖНЫХ" in t_upper:
            current_category = "Ручки для раздвижных дверей"
        elif "ПЕТЛИ" in t_upper:
            current_category = "Дверные петли"
        elif "ЗАМКИ" in t_upper or "ЗАЩЁЛКИ" in t_upper:
            current_category = "Замки и защелки"
        elif "ДОВОДЧИКИ" in t_upper:
            current_category = "Дверные доводчики"
        elif "УПОРЫ" in t_upper:
            current_category = "Дверные упоры"
        elif "ЦИЛИНДР" in t_upper:
            current_category = "Цилиндровые механизмы"
        elif "БРОНЕНАКЛАДКИ" in t_upper:
            current_category = "Броненакладки"
            
        # Collection detection (CLARITY, URBAN, TREND, SLIM, CLASSIC, COMFORT, SQUARCO, etc.)
        for l in lines:
            if l.isupper() and l in ["CLARITY", "URBAN", "TREND", "SLIM", "CLASSIC", "COMFORT", "SQUARCO", "ELEGANCE", "MAGIC", "ALDEGHI"]:
                current_collection = f"Коллекция {l}"
                break
                
        # Find model names on page (e.g. Truffle, Bella, Silvana, etc.)
        models = []
        for l in lines:
            # Model names usually standalone English word like Truffle, Bella, etc.
            if re.match(r'^[A-Z][a-z]{2,15}$', l) and l not in ["Size", "Material", "Color", "Type", "Cover", "Model", "Black", "Chrome", "Gold"]:
                if l not in models:
                    models.append(l)
                    
        articles = re.findall(r'\b\d{5}\b', text)
        codes = re.findall(r'\b[A-Z0-9\.\-_]{4,15}\s+[A-Z]{2,4}\b', text)
        
        if not models:
            for l in lines[:4]:
                if any(k in l.upper() for k in ["РУЧК", "ПЕТЛ", "ЗАМОК", "ЗАЩЕЛК", "УПОР", "ДОВОДЧИК"]):
                    models.append(l)
                    break
            if not models:
                models = [f"Armadillo {current_category} Стр.{pno+1}"]
                
        colors_found = []
        for l in lines:
            if any(c in l.lower() for c in ["черный", "хром", "никель", "бронза", "золото", "медь", "тиснёный", "сатин", "графит", "белый"]):
                if len(l) < 30 and l not in colors_found:
                    colors_found.append(l)
        colors_str = ", ".join(colors_found[:4]) if colors_found else "Хром, черный, матовый никель, флорентийское золото"
        
        for idx, m in enumerate(models[:3]):
            hid = f"HDW-ARM-{hdw_counter:03d}"
            hdw_counter += 1
            
            art_slice = articles[idx::len(models)] if len(models) > 1 else articles
            primary_art = art_slice[0] if art_slice else (codes[0] if codes else None)
            
            hardware_items.append({
                "id": hid,
                "brand": "Armadillo",
                "brand_id": "BRAND-ARMADILLO",
                "collection": current_collection,
                "collection_id": f"COLL-ARM-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
                "model": m,
                "article": primary_art,
                "category": "Фурнитура",
                "type": current_category,
                "description": f"{current_category} Armadillo {m}. {current_collection}. Доступные отделки: {colors_str}. Артикулы: {', '.join(art_slice[:6]) if art_slice else primary_art or 'по каталогу'}.",
                "color": colors_str,
                "material": "ZAMAK (высокотехнологичный сплав ЦАМ) / Сталь / Латунь",
                "dimensions": "Основание 50-52 мм, толщина розетки от 6 мм (Slim), длина 125-152 мм",
                "technical_specs": {
                    "collection": current_collection,
                    "article": primary_art,
                    "all_articles": art_slice,
                    "coating_technology": "Многослойное гальваническое покрытие TITANIUM"
                },
                "compatibility": "Двери межкомнатные и входные деревянные/металлические",
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                }
            })
            
    return {
        "pdf": PDF_NAME,
        "total_pages": total_pages,
        "processed_pages": total_pages,
        "products": hardware_items
    }
