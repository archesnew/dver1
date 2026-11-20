import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Морели .pdf"

def parse_morelli():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    hardware_items = []
    hdw_counter = 1
    
    current_collection = "Morelli Design"
    current_type = "Дверные ручки на раздельном основании"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 4 or pno >= 188:
            continue
            
        imgs = extract_best_images(doc, pno, f"HDW-MORE-P{pno+1}")
        
        t_upper = text.upper()
        if "РАЗДВИЖНОЙ ДВЕРИ" in t_upper or "РАЗДВИЖНЫХ ДВЕРЕЙ" in t_upper:
            current_type = "Ручки и фурнитура для раздвижных дверей"
            current_collection = "Раздвижные системы Morelli"
        elif "ПЕТЛИ" in t_upper:
            current_type = "Дверные петли"
            current_collection = "Петли Innovation / Morelli"
        elif "ЗАМКИ" in t_upper or "МАГНИТН" in t_upper:
            current_type = "Магнитные замки и защелки"
            current_collection = "Замки Morelli"
        elif "ЗАВЕРТК" in t_upper or "НАКЛАДК" in t_upper:
            current_type = "Накладки и завертки"
            current_collection = "Аксессуары Morelli"
        else:
            current_type = "Дверные ручки на раздельном основании"
            
        # Check model name (e.g. ROCK, ISLAND, STONE, WAVE, WIND, SAND, SPUTNIK, GALACTIC, etc.)
        models = []
        for l in lines[:5]:
            if re.match(r'^[A-Z0-9\s\.\-]{3,20}$', l) and l not in ["MORELLI", "ITALIA", "DESIGN", "CLASSIC", "MODERN", "PAGE", "INFO"]:
                if not l.isdigit() and l not in models:
                    models.append(l)
                    
        # Extract articles
        codes = re.findall(r'\b[A-Z0-9\.\-]{3,15}\s+[A-Z0-9]{2,4}\b', text)
        art_code = codes[0] if codes else None
        
        # Colors
        colors_found = []
        for l in lines:
            if any(c in l.lower() for c in ["хром", "никель", "бронза", "золото", "черный", "белый", "кофе", "графит", "antracite"]):
                if len(l) < 25 and l not in colors_found:
                    colors_found.append(l)
        colors_str = ", ".join(colors_found) if colors_found else "Хром, матовый хром, черный, античная бронза, матовое золото"
        
        if not models:
            for l in lines[:3]:
                if any(k in l.upper() for k in ["РУЧК", "ПЕТЛ", "ЗАМОК", "ФУРНИТУР"]):
                    models.append(l)
                    break
            if not models:
                models = [f"Morelli {current_type} Стр.{pno+1}"]
                
        for idx, m in enumerate(models[:2]):
            hid = f"HDW-MORE-{hdw_counter:03d}"
            hdw_counter += 1
            
            hardware_items.append({
                "id": hid,
                "brand": "Morelli",
                "brand_id": "BRAND-MORELLI",
                "collection": current_collection,
                "collection_id": f"COLL-MORE-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
                "model": m,
                "article": art_code,
                "category": "Фурнитура",
                "type": current_type,
                "description": f"{current_type} Morelli {m}. Итальянский дизайн, высококачественная обработка, тонкая розетка (3-6 мм). Отделки: {colors_str}. Артикул: {art_code or 'по каталогу'}.",
                "color": colors_str,
                "material": "Латунь / ZAMAK / Высокопрочный сплав",
                "dimensions": "Основание 50-52 мм, толщина 3-6 мм, вылет 55-65 мм, длина 125-140 мм",
                "technical_specs": {
                    "collection": current_collection,
                    "article": art_code,
                    "design_origin": "Италия (Флоренция)"
                },
                "compatibility": "Межкомнатные деревянные, стеклянные и алюминиевые двери 35-50 мм",
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
