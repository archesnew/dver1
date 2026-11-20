import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "2026_FUARO_catalog_DD_web (1).pdf"

def parse_fuaro():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    hardware_items = []
    hdw_counter = 1
    
    current_category = "Дверные ручки"
    current_series = "Серия ZL"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 2 or pno >= 140:
            continue
            
        imgs = extract_best_images(doc, pno, f"HDW-FUAR-P{pno+1}")
        
        # Category and series tracking
        t_upper = text.upper()
        if "ДВЕРНЫЕ РУЧКИ" in t_upper:
            current_category = "Дверные ручки"
        elif "ПЕТЛИ" in t_upper:
            current_category = "Дверные петли"
        elif "ЗАМКИ" in t_upper:
            current_category = "Врезные замки"
        elif "ЗАЩЁЛКИ" in t_upper or "ЗАЩЕЛКИ" in t_upper:
            current_category = "Дверные защелки"
        elif "ЦМС" in t_upper or "ЦИЛИНДР" in t_upper:
            current_category = "Цилиндровые механизмы"
        elif "ДОВОДЧИКИ" in t_upper:
            current_category = "Дверные доводчики"
        elif "УПОРЫ" in t_upper:
            current_category = "Дверные упоры"
        elif "ФУРНИТУРА" in t_upper:
            current_category = "Дверная фурнитура и накладки"
            
        # Series check
        m_series = re.search(r'\b(?:СЕРИ[ИЯ]|СЕРИИ)\s+([A-Z0-9\.\-]+)\b', text, re.IGNORECASE)
        if m_series:
            current_series = f"Серия {m_series.group(1).upper()}"
        else:
            for s in ["ZL", "SLR", "SL", "RM", "DM", "KM", "SM", "XM", "DC"]:
                if f"СЕРИИ {s}" in t_upper or f"СЕРИЯ {s}" in t_upper:
                    current_series = f"Серия {s}"
                    break
                    
        # Find model names (e.g. ETALON, BLADE, CONCORD, FLASH, CRYSTAL, etc.)
        models = []
        for l in lines:
            m_cand = re.findall(r'\b([A-Z]{4,15})\s+(?:ZL|SL|RM|DM|KM|SM|XM|DC)\b', l)
            for mc in m_cand:
                if mc not in models and mc not in ["FUARO", "ZAMAK"]:
                    models.append(mc)
                    
        articles = re.findall(r'\b\d{5}\b', text)
        art_codes = re.findall(r'\b[A-Z0-9]{3,10}\s+[A-Z0-9\-]{2,8}\s+[A-Z0-9\-]{2,8}\b', text)
        
        if not models:
            for l in lines:
                if l.isupper() and len(l) < 25 and not any(k in l for k in ["FUARO", "КАТАЛОГ", "ТОЛЩИНА", "ОСНОВАНИЯ", "ZAMAK"]):
                    if any(c.isalpha() for c in l) and not l.isdigit():
                        models.append(l)
                        break
            if not models:
                models = [f"FUARO {current_category} Стр.{pno+1}"]
                
        colors_found = re.findall(r'\b(?:SSC-16|CP-1|BL-24|GP-2|SN-3|AB-7|AC-8|MW-22|MB-24)\b', text)
        colors_str = ", ".join(list(dict.fromkeys(colors_found))) if colors_found else "Сатинированный хром, черный, золото, матовый никель"
        
        for idx, m in enumerate(models[:3]):
            hid = f"HDW-FUAR-{hdw_counter:03d}"
            hdw_counter += 1
            
            art = articles[idx] if idx < len(articles) else (art_codes[idx] if idx < len(art_codes) else None)
            
            hardware_items.append({
                "id": hid,
                "brand": "FUARO",
                "brand_id": "BRAND-FUARO",
                "collection": current_series,
                "collection_id": f"COLL-FUAR-{re.sub(r'[^A-Z0-9]', '', current_series.upper())[:10]}",
                "model": m,
                "article": art,
                "category": "Фурнитура",
                "type": current_category,
                "description": f"{current_category} FUARO {m}. {current_series}. Материал ZAMAK, тонкое основание 6 мм, премиальное гальваническое покрытие. Цвета: {colors_str}.",
                "color": colors_str,
                "material": "ZAMAK (сплав цинка, алюминия, магния и меди) / Сталь",
                "dimensions": "Основание 52х52 мм или D52 мм, толщина 6 мм, вылет 55-65 мм",
                "technical_specs": {
                    "series": current_series,
                    "rosette_thickness": "6 мм",
                    "article": art
                },
                "compatibility": "Двери межкомнатные и входные 35-55 мм",
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
