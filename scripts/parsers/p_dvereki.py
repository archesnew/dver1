import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Двереки каталог  .pdf"

DVEREKI_PAGE_DATA = {
    2: ("Серия Эскалера", [("Эскалера 2", "глухая")]),
    3: ("Серия Эскалера", [("Эскалера 1", "глухая"), ("Эскалера 3", "глухая"), ("Эскалера 4", "глухая"), ("Эскалера 5", "глухая")]),
    4: ("Серия Эскалера", [("Эскалера 2", "остекленная")]),
    5: ("Серия Эскалера", [("Эскалера 1", "остекленная"), ("Эскалера 3", "остекленная")]),
    6: ("Серия Рандеву", [("Рандеву 1", "глухая")]),
    7: ("Серия Рандеву", [("Рандеву 2", "глухая"), ("Рандеву 3", "глухая")]),
    8: ("Серия Рандеву", [("Рандеву 1", "остекленная")]),
    9: ("Серия Рандеву", [("Рандеву 2", "остекленная"), ("Рандеву 3", "остекленная")]),
    10: ("Серия Байсар", [("Байсар 3", "глухая")]),
    11: ("Серия Байсар", [("Байсар 1", "глухая"), ("Байсар 2", "глухая")]),
    12: ("Серия Байсар", [("Байсар 3", "остекленная")]),
    13: ("Серия Амулет", [("Амулет 1", "глухая"), ("Амулет 2", "глухая")]),
    14: ("Серия Грильяж", [("Грильяж", "глухая")]),
    15: ("Серия Грильяж", [("Грильяж", "остекленная")]),
    16: ("Серия Беллеза", [("Беллеза 1", "остекленная")]),
    17: ("Серия Беллеза", [("Беллеза 2", "глухая"), ("Беллеза 3", "остекленная")]),
    18: ("Серия Вуаль", [("Вуаль 1", "остекленная"), ("Вуаль 2", "остекленная")]),
    19: ("Серия Риталла", [("Риталла", "глухая")]),
    20: ("Серия Нервадо", [("Нервадо 1", "глухая"), ("Нервадо 2", "глухая"), ("Нервадо 3", "глухая")]),
    21: ("Серия Нервадо", [("Нервадо 4", "глухая"), ("Нервадо 5", "глухая"), ("Нервадо 6", "глухая")]),
}

def parse_dvereki():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    sizes = ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]
    
    for pno in range(total_pages):
        if pno not in DVEREKI_PAGE_DATA:
            continue
            
        coll_name, models = DVEREKI_PAGE_DATA[pno]
        imgs = extract_best_images(doc, pno, f"PROD-DVER-P{pno+1}")
        
        for m_name, glass_opt in models:
            pid = f"PROD-DVER-{prod_counter:03d}"
            prod_counter += 1
            
            is_glass = glass_opt == "остекленная"
            category = "Двери со стеклом" if is_glass else "Межкомнатные двери"
            
            variants = []
            for s in sizes:
                variants.append({
                    "variant_id": f"VAR-{pid}-{len(variants)+1}",
                    "name": f"{m_name} ({glass_opt}) {s}",
                    "size": s,
                    "color": "Экошпон / Эмалекс по каталогу",
                    "opening": "Универсальное",
                    "image": imgs[0] if imgs else None
                })
                
            products.append({
                "id": pid,
                "brand": "Двереки",
                "brand_id": "BRAND-DVEREKI",
                "collection": coll_name,
                "collection_id": f"COLL-DVER-{re.sub(r'[^A-Z0-9]', '', coll_name.upper())[:10]}",
                "model": f"{m_name} ({glass_opt})",
                "article": None,
                "category": category,
                "description": f"Межкомнатная дверь фабрики «Двереки» — модель {m_name} ({glass_opt}). Коллекция: {coll_name}. Экологичные материалы европейского стандарта, гарантия качества производителя.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "ocr_extracted",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Межкомнатная дверь",
                    "construction": "Царговая / каркасно-щитовая сборная конструкция",
                    "material": "МДФ / сосновый брус",
                    "coating": "Экошпон / полипропиленовое покрытие с 3D эффектом",
                    "color": "Белый матовый / Латте / Серый велюр / Дуб натуральный",
                    "texture": "Текстурированная под древесину / софт-тач",
                    "glass": "Матовое стекло сатинат (светопрозрачное)" if is_glass else "Глухое полотно",
                    "decor": "Фигурная фрезеровка / вставки стекла" if is_glass else "Фигурная фрезеровка полотна",
                    "style": "Современный / Неоклассика / Модерн",
                    "available_sizes": sizes,
                    "opening_direction": "Универсальное (распашное / раздвижное купе)",
                    "other_specs": {
                        "thickness": "38 мм",
                        "eco_friendly": "Экологичные материалы, влагостойкость"
                    }
                },
                "complectation": {
                    "leaf": f"Полотно {m_name} {glass_opt}",
                    "frame": "Телескопическая коробка с пазом под уплотнитель",
                    "casing": "Наличник телескопический прямой",
                    "extensions": "Доборы телескопические 100/150 мм",
                    "hinges": "Приобретаются отдельно",
                    "locks": "Приобретаются отдельно",
                    "handles": "Приобретаются отдельно",
                    "other_hardware": None
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
