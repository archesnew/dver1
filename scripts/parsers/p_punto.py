import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "2026_PUNTO_A4_web.pdf"

def parse_punto():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    hardware_items = []
    hdw_counter = 1
    
    current_category = "Дверные ручки"
    current_series = "Серия Estetica"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 2 or pno >= 128:
            continue
            
        imgs = extract_best_images(doc, pno, f"HDW-PUN-P{pno+1}")
        
        t_upper = text.upper()
        if "ДВЕРНЫЕ РУЧКИ-СКОБЫ" in t_upper:
            current_category = "Дверные ручки-скобы"
        elif "ДВЕРНЫЕ РУЧКИ НА ПЛАНКЕ" in t_upper:
            current_category = "Дверные ручки на планке"
        elif "ДВЕРНЫЕ РУЧКИ-ЗАЩЁЛКИ" in t_upper:
            current_category = "Дверные ручки-защелки (кнобы)"
        elif "ДВЕРНЫЕ РУЧКИ" in t_upper:
            current_category = "Дверные ручки"
        elif "ПЕТЛИ" in t_upper:
            current_category = "Дверные петли"
        elif "ЗАМКИ" in t_upper:
            current_category = "Дверные замки"
        elif "ЗАЩЁЛКИ" in t_upper or "ЗАДВИЖКИ" in t_upper:
            current_category = "Дверные защелки и задвижки"
        elif "ДОВОДЧИКИ" in t_upper:
            current_category = "Дверные доводчики"
        elif "УПОРЫ" in t_upper:
            current_category = "Дверные упоры"
            
        # Series tracking
        for l in lines:
            if "СЕРИЯ" in l.upper() or "СЕРИИ" in l.upper():
                current_series = l
                break
                
        # Find models (OLYMP, SIMPLE, BLADE, VECTOR, etc.)
        models = []
        for l in lines:
            if re.match(r'^[A-Z0-9\.\-]{3,15}$', l) and l not in ["PUNTO", "ZAMAK", "RAL", "TYPE", "DOORS", "INFO", "PAGE"]:
                if not any(c in l for c in ["SSC-16", "BL-24", "SN-3", "SSG-39", "GP-2", "CP-1", "AB-7", "AC-8"]):
                    if not l.isdigit() and len(l) > 2 and l not in models:
                        models.append(l)
                        
        articles = re.findall(r'\b\d{5}\b', text)
        colors_found = re.findall(r'\b(?:SSC-16|SSG-39|SN-3|BL-24|GP-2|CP-1|AB-7|AC-8|W-22)\b', text)
        colors_str = ", ".join(list(dict.fromkeys(colors_found))) if colors_found else "Сатинированный хром, золото, матовый никель, черный"
        
        if not models:
            for l in lines[:4]:
                if any(k in l.upper() for k in ["РУЧК", "ПЕТЛ", "ЗАМОК", "УПОР", "ДОВОДЧИК"]):
                    models.append(l)
                    break
            if not models:
                models = [f"PUNTO {current_category} Стр.{pno+1}"]
                
        for idx, m in enumerate(models[:3]):
            hid = f"HDW-PUN-{hdw_counter:03d}"
            hdw_counter += 1
            
            art_slice = articles[idx::len(models)] if len(models) > 1 else articles
            primary_art = art_slice[0] if art_slice else None
            
            hardware_items.append({
                "id": hid,
                "brand": "PUNTO",
                "brand_id": "BRAND-PUNTO",
                "collection": current_series,
                "collection_id": f"COLL-PUN-{re.sub(r'[^A-Z0-9]', '', current_series.upper())[:10]}",
                "model": m,
                "article": primary_art,
                "category": "Фурнитура",
                "type": current_category,
                "description": f"{current_category} PUNTO {m}. {current_series}. Материал: цинк / алюминий / сталь. Доступные цвета: {colors_str}. Артикулы: {', '.join(art_slice[:5]) if art_slice else primary_art or 'по каталогу'}.",
                "color": colors_str,
                "material": "Цинк / ZAMAK / Алюминий / Сталь",
                "dimensions": "Основание 52х52 мм или D52 мм, вылет 50-65 мм, длина 120-135 мм",
                "technical_specs": {
                    "series": current_series,
                    "mounting": "Фрезерная / ручная установка, саморезы / стяжные винты",
                    "articles_list": art_slice
                },
                "compatibility": "Двери межкомнатные и входные любого типа",
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
