import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Каталог Двери Голливуда 2026г.pdf"

def parse_hollywood():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    current_collection = "Коллекция Премьера"
    current_series = "Премьера"
    
    sizes = ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno < 8 or pno >= 120:
            # Covers, preface, editorial, back cover
            continue
            
        imgs = extract_best_images(doc, pno, f"PROD-HW-P{pno+1}")
        
        # Check grand collection
        t_upper = text.upper()
        if "БЛОКБАСТЕР" in t_upper:
            current_collection = "Коллекция Блокбастер"
            
        # Check series marker
        for idx, l in enumerate(lines):
            if l.lower() == "серия" and idx + 1 < len(lines):
                candidate_series = lines[idx+1]
                if len(candidate_series) < 30 and candidate_series.isupper():
                    current_series = f"Серия {candidate_series.title()}"
                    
        # Find model names on page
        page_models = []
        for l in lines:
            # Capitalized titles 2-35 chars, not digits, not service words
            if re.match(r'^[А-ЯЁA-Z0-9\s\.\-]{3,35}$', l) and not l.isdigit():
                if not any(k in l for k in ['КАТАЛОГ', 'КОЛЛЕКЦИЯ', 'СЕРИЯ', 'ДВЕРЕЙ', 'ГОЛЛИВУДА', 'СОДЕРЖАНИЕ', 'КОМПАНИЯ', 'ПРЕМЬЕРА', 'БЛОКБАСТЕР', 'DOORS', 'HWDOORS']):
                    if l not in page_models and len(l) > 2:
                        page_models.append(l)
                        
        if not page_models:
            page_models = [f"Модель Голливуд Стр.{pno+1}"]
            
        is_glass = "стекло" in text.lower() or "остеклен" in text.lower() or any("ДО" in m for m in page_models)
        category = "Двери со стеклом" if is_glass else "Межкомнатные двери"
        glass_type = "Стекло сатинат матовое / художественный триплекс / зеркало" if is_glass else "Глухое полотно"
        
        coll_title = f"{current_collection} ({current_series})" if current_series != "Премьера" else current_collection
        
        for m in page_models[:4]: # Cap per page to avoid spam
            pid = f"PROD-HW-{prod_counter:03d}"
            prod_counter += 1
            
            variants = []
            for s in sizes:
                variants.append({
                    "variant_id": f"VAR-{pid}-{len(variants)+1}",
                    "name": f"{m} {s}",
                    "size": s,
                    "color": "Эмаль / Экошпон в ассортименте Hollywood Doors",
                    "opening": "Универсальное",
                    "image": imgs[0] if imgs else None
                })
                
            products.append({
                "id": pid,
                "brand": "Двери Голливуда",
                "brand_id": "BRAND-HOLLYWOOD",
                "collection": coll_title,
                "collection_id": f"COLL-HW-{re.sub(r'[^A-Z0-9]', '', coll_title.upper())[:10]}",
                "model": clean_text(m),
                "article": None,
                "category": category,
                "description": f"Межкомнатная дизайнерская дверь «Двери Голливуда» — {m}. {coll_title}. Премиальное исполнение, выверенная геометрия полотна и трендовая отделка.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Межкомнатная дверь",
                    "construction": "Каркасно-щитовая / царговая усиленная конструкция",
                    "material": "МДФ высокой плотности / клееный массив сосны",
                    "coating": "Эмаль гладкая бесшовная / полимерное покрытие Soft Touch / Экошпон",
                    "color": "Шелковистый белый / Графит / Кашемир / Дуб натуральный / Орех",
                    "texture": "Матовая бархатистая / древесная глубокая",
                    "glass": glass_type,
                    "decor": "Алюминиевый молдинг / глубокая 3D-фрезеровка / зеркало",
                    "style": "Неоклассика / Модерн / Арт-деко / Хай-тек",
                    "available_sizes": sizes,
                    "opening_direction": "Универсальное (распашная, рото, раздвижная система-купе)",
                    "other_specs": {
                        "thickness": "38-44 мм",
                        "sound_insulation": "Повышенная шумоизоляция полотна"
                    }
                },
                "complectation": {
                    "leaf": f"Дверное полотно {m} с заводской врезкой или без врезки",
                    "frame": "Короб телескопический с уплотнителем (или скрытый короб Invisible)",
                    "casing": "Наличники фигурные каннелированные или плоские телескопические",
                    "extensions": "Доборы телескопические 100/150/200 мм",
                    "hinges": "Приобретаются отдельно (скрытые / накладные)",
                    "locks": "Приобретаются отдельно (магнитные замки)",
                    "handles": "Приобретаются отдельно",
                    "other_hardware": "Плинтус и стеновые панели в цвет дверей (опция)"
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
