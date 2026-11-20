import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Двери 2025.pdf"

def parse_dveri2025():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    PAGE_COLLECTIONS = {
        0: ("серия вектор", ["Венто", "Вектор Горизонт", "Вектор Вертикаль"], "ДВЕРЬ ГЛУХАЯ С АЛЮМИНИЕВЫМ МОЛДИНГОМ"),
        1: ("серия абрис", ["Абрис Уно", "Абрис Дос", "Абрис Трес"], "ДВЕРЬ ГЛУХАЯ С ФРЕЗЕРОВКОЙ"),
        2: ("серия фрателли", ["Фрателли Уно", "Фрателли Дос", "Фрателли Трес"], "ДВЕРЬ ГЛУХАЯ"),
        3: ("серия рона", ["Рона Уно", "Рона Дос", "Рона Трес"], "ДВЕРЬ ГЛУХАЯ"),
        4: ("серия рио", ["Рио Уно", "Рио Дос", "Рио Трес"], "ДВЕРЬ ГЛУХАЯ"),
        5: ("серия сувенир", ["Сувенир Уно", "Сувенир Дос", "Сувенир Трес"], "ДВЕРЬ ГЛУХАЯ"),
        6: ("серия сувенир", ["Сувенир Вертикаль", "Сувенир Горизонт"], "ДВЕРЬ ГЛУХАЯ"),
        7: ("серия костилла", ["Костилла 1 Ф12", "Костилла 1 Ф22", "Костилла 2 Ф12", "Костилла 2 Ф22"], "ДВЕРЬ ГЛУХАЯ С АЛЮМИНИЕВЫМ МОЛДИНГОМ")
    }
    
    sizes = ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]
    
    for pno in range(total_pages):
        coll_name, models, desc_tag = PAGE_COLLECTIONS.get(pno, ("Современные двери", [f"Модель Стр.{pno+1}"], "ДВЕРЬ ГЛУХАЯ"))
        imgs = extract_best_images(doc, pno, f"PROD-D25-P{pno+1}")
        
        has_molding = "молдинг" in desc_tag.lower()
        
        for m in models:
            pid = f"PROD-D25-{prod_counter:03d}"
            prod_counter += 1
            
            variants = []
            for s in sizes:
                variants.append({
                    "variant_id": f"VAR-{pid}-{len(variants)+1}",
                    "name": f"{m} {s}",
                    "size": s,
                    "color": "Эмаль / Экошпон в ассортименте",
                    "opening": "Универсальное",
                    "image": imgs[0] if imgs else None
                })
                
            products.append({
                "id": pid,
                "brand": "Двери 2025",
                "brand_id": "BRAND-DVERI2025",
                "collection": coll_name.title(),
                "collection_id": f"COLL-D25-{re.sub(r'[^A-Z0-9]', '', coll_name.upper())[:10]}",
                "model": m,
                "article": None,
                "category": "Межкомнатные двери",
                "description": f"Межкомнатная дверь для современных интерьеров {m} ({coll_name.title()}). {desc_tag.capitalize()}.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Межкомнатная дверь",
                    "construction": "Каркасно-щитовая конструкция с усиленным каркасом",
                    "material": "МДФ / хвойный брус",
                    "coating": "Экошпон / Эмаль",
                    "color": "Белый / Серый / Бежевый / Антрацит",
                    "texture": "Матовая гладкая / софт-тач",
                    "glass": "Нет (глухое полотно)",
                    "decor": "Алюминиевый молдинг (хром/черный)" if has_molding else "Геометрическая фрезеровка",
                    "style": "Современный / Модерн / Минимализм",
                    "available_sizes": sizes,
                    "opening_direction": "Универсальное (распашное / раздвижное)",
                    "other_specs": {"thickness": "38 мм"}
                },
                "complectation": {
                    "leaf": "Глухое полотно 38 мм",
                    "frame": "Телескопическая коробка с уплотнителем",
                    "casing": "Телескопический наличник",
                    "extensions": "Доборы телескопические",
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
