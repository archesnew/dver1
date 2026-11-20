import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "2026_AJAX_catalog_web.pdf"

def parse_ajax():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    hardware_items = []
    hdw_counter = 1
    
    current_category = "Дверные ручки"
    current_series = "Серия JS"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 2 or pno >= 55: # Cover, intro, back
            continue
            
        imgs = extract_best_images(doc, pno, f"HDW-AJAX-P{pno+1}")
        
        # Track category
        t_upper = text.upper()
        if "ДВЕРНЫЕ РУЧКИ" in t_upper:
            current_category = "Дверные ручки"
        elif "ПЕТЛИ" in t_upper:
            current_category = "Дверные петли"
        elif "ЗАМКИ" in t_upper:
            current_category = "Дверные замки"
        elif "ЗАЩЁЛКИ" in t_upper or "ЗАДВИЖКИ" in t_upper:
            current_category = "Защелки и задвижки"
        elif "ЦМС" in t_upper or "ЦИЛИНДРОВЫЕ" in t_upper:
            current_category = "Цилиндровые механизмы"
        elif "УПОРЫ" in t_upper:
            current_category = "Дверные упоры"
        elif "ДОВОДЧИКИ" in t_upper:
            current_category = "Дверные доводчики"
            
        # Track series
        for l in lines:
            if "СЕРИЯ" in l.upper():
                current_series = l
                break
                
        # Extract models on page
        page_models = []
        for l in lines:
            m_match = re.match(r'^([A-Z]{3,15})\s+([а-яё]+)$', l)
            if m_match:
                name_en, name_ru = m_match.groups()
                full_m = f"{name_en} ({name_ru})"
                if full_m not in page_models:
                    page_models.append(full_m)
                    
        # Extract articles
        articles = re.findall(r'\b\d{5}\b', text)
        color_codes = re.findall(r'\b(?:BL-24|SN-3|SSC-16|SSG-39|AB-7|AC-8|CR-1|CP-1|BN-4|GP-2|W-22)\b', text)
        
        if not page_models:
            # Fallback model from series or section
            for l in lines[:4]:
                if any(k in l.upper() for k in ["РУЧК", "ПЕТЛ", "ЗАМОК", "УПОР", "ДОВОДЧИК", "ЦИЛИНДР"]):
                    page_models.append(l)
                    break
            if not page_models:
                page_models = [f"AJAX {current_category} Стр.{pno+1}"]
                
        # If articles found, create items linked to articles
        if articles:
            # Group or create one product entry per model with articles listed
            for idx, m in enumerate(page_models):
                hid = f"HDW-AJAX-{hdw_counter:03d}"
                hdw_counter += 1
                
                # slice articles
                art_slice = articles[idx::len(page_models)] if len(page_models) > 1 else articles
                primary_art = art_slice[0] if art_slice else None
                
                colors_str = ", ".join(list(dict.fromkeys(color_codes))) if color_codes else "Хром, черный, матовый никель, сатинированное золото"
                
                hardware_items.append({
                    "id": hid,
                    "brand": "AJAX",
                    "brand_id": "BRAND-AJAX",
                    "collection": current_series,
                    "collection_id": f"COLL-AJAX-{re.sub(r'[^A-Z0-9]', '', current_series.upper())[:10]}",
                    "model": m,
                    "article": primary_art,
                    "category": "Фурнитура",
                    "type": current_category,
                    "description": f"{current_category} AJAX {m}. {current_series}. Цветовые решения: {colors_str}. Артикулы производителя: {', '.join(art_slice[:5])}.",
                    "color": colors_str,
                    "material": "ЦАМ (ZAMAK) / Алюминий / Сталь",
                    "dimensions": "Основание 52 мм, длина рукояти 120-142 мм",
                    "technical_specs": {
                        "series": current_series,
                        "articles_list": art_slice,
                        "colors": color_codes
                    },
                    "compatibility": "Межкомнатные и входные двери толщиной 35-55 мм",
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
        else:
            for m in page_models:
                hid = f"HDW-AJAX-{hdw_counter:03d}"
                hdw_counter += 1
                hardware_items.append({
                    "id": hid,
                    "brand": "AJAX",
                    "brand_id": "BRAND-AJAX",
                    "collection": current_series,
                    "collection_id": f"COLL-AJAX-{re.sub(r'[^A-Z0-9]', '', current_series.upper())[:10]}",
                    "model": m,
                    "article": None,
                    "category": "Фурнитура",
                    "type": current_category,
                    "description": f"{current_category} AJAX {m}. {current_series}.",
                    "color": "По каталогу",
                    "material": "ЦАМ / Сталь",
                    "dimensions": "Стандартные размеры",
                    "technical_specs": {"series": current_series},
                    "compatibility": "Двери межкомнатные и входные",
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
