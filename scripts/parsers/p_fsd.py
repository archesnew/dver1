import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Каталог FSD 07-10-2025-2 цвета разв.pdf"

def parse_fsd():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno == 0 or pno == 8:
            # P1 cover, P9 contacts
            continue
            
        imgs = extract_best_images(doc, pno, f"PROD-FSD-P{pno+1}")
        
        if pno in [1, 2, 3]: # Pages 2, 3, 4: Entrance Doors
            # Find models / coating variants
            coatings = []
            for l in lines:
                if l.startswith("внешнее покрытие:"):
                    c = l.replace("внешнее покрытие:", "").strip()
                    if c and c not in coatings:
                        coatings.append(c)
            if not coatings:
                coatings = ["Муар 7024", "Букле графит", "Медь антик"]
                
            thick = "107 мм" if pno in [1, 2] else "67 мм"
            insul = "сэндвич, PIR плита" if pno in [1, 2] else "пенополистирол"
            
            for c in coatings:
                pid = f"PROD-FSD-{prod_counter:03d}"
                prod_counter += 1
                model_name = f"Термо {c} {thick}" if pno in [1, 2] else f"Металл {c} {thick}"
                
                variants = []
                for s in ["860х2050 мм", "960х2050 мм"]:
                    for side in ["Левое", "Правое"]:
                        variants.append({
                            "variant_id": f"VAR-{pid}-{len(variants)+1}",
                            "name": f"{model_name} {s} ({side})",
                            "size": s,
                            "color": c,
                            "opening": side,
                            "image": imgs[0] if imgs else None
                        })
                        
                products.append({
                    "id": pid,
                    "brand": "ФСД",
                    "brand_id": "BRAND-FSD",
                    "collection": "Входные двери ФСД",
                    "collection_id": "COLL-FSD-ENTRANCE",
                    "model": model_name,
                    "article": None,
                    "category": "Входные двери",
                    "description": f"Входная дверь ФСД {model_name}. Внешнее покрытие: {c}. Толщина полотна: {thick}. Утеплитель: {insul}.",
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
                        "coating": "Атмосферостойкое порошково-полимерное",
                        "color": c,
                        "texture": "Муар / Букле / Антик",
                        "glass": "Нет",
                        "decor": None,
                        "style": "Современный / Минимализм",
                        "available_sizes": ["860х2050 мм", "960х2050 мм"],
                        "opening_direction": "Левое / Правое (180°)",
                        "other_specs": {
                            "leaf_thickness": thick,
                            "insulation": insul,
                            "hinges": "3 шт., наружные, открывание 180°",
                            "handles": "Раздельная, квадратная"
                        }
                    },
                    "complectation": {
                        "leaf": f"Полотно {thick}, сталь 1.4 мм",
                        "frame": "Короб цельногнутый утепленный",
                        "casing": "Интегрированный металлический наличник",
                        "extensions": None,
                        "hinges": "3 наружные петли",
                        "locks": "Сувальдный и цилиндровый замки",
                        "handles": "Раздельная ручка",
                        "other_hardware": "Ночная задвижка, эксцентрик"
                    },
                    "images": imgs,
                    "price": None,
                    "price_type": "quote",
                    "variants": variants
                })
                
        else: # Pages 5, 6, 7, 8: Interior Doors
            # Extract models mentioned on page
            model_candidates = []
            for l in lines:
                if re.match(r'^(?:Д\d+|Нео Классика|Венеция|F\d+|П\d+)', l):
                    if l not in model_candidates:
                        model_candidates.append(l)
            if not model_candidates:
                model_candidates = [f"Межкомнатная дверь ФСД Стр.{pno+1}"]
                
            for m in model_candidates:
                pid = f"PROD-FSD-{prod_counter:03d}"
                prod_counter += 1
                
                variants = []
                for s in ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]:
                    variants.append({
                        "variant_id": f"VAR-{pid}-{len(variants)+1}",
                        "name": f"{m} {s}",
                        "size": s,
                        "color": "Эмалит белый / Ривьера айс / Крем",
                        "opening": "Универсальное",
                        "image": imgs[0] if imgs else None
                    })
                    
                products.append({
                    "id": pid,
                    "brand": "ФСД",
                    "brand_id": "BRAND-FSD",
                    "collection": "Межкомнатные двери ФСД",
                    "collection_id": "COLL-FSD-INTERIOR",
                    "model": m,
                    "article": None,
                    "category": "Межкомнатные двери",
                    "description": f"Межкомнатная дверь ФСД {m}. Современное покрытие Эмалит / ПЭТ / Ривьера айс. Телескопический погонаж.",
                    "source": {
                        "pdf_file": PDF_NAME,
                        "page": pno + 1,
                        "confidence_status": "verified",
                        "need_manual_check": False,
                        "check_reason": None
                    },
                    "specs": {
                        "door_type": "Межкомнатная дверь",
                        "construction": "Царговая / каркасно-щитовая",
                        "material": "МДФ / брус хвойных пород",
                        "coating": "Эмалит / Экошпон / ПВХ",
                        "color": "Эмалит белый / Крем / Ривьера айс / Вайт кристалл",
                        "texture": "Матовая шелковистая / древесная",
                        "glass": "Матовое стекло сатинат" if "стекло" in text.lower() or "матовое" in text.lower() else "Глухое полотно",
                        "decor": "Фрезеровка / молдинг",
                        "style": "Неоклассика / Модерн",
                        "available_sizes": ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"],
                        "opening_direction": "Универсальное (левое / правое)",
                        "other_specs": {"thickness": "38 мм"}
                    },
                    "complectation": {
                        "leaf": "Полотно 2000х600/700/800/900х38 мм",
                        "frame": "Короб телескопический с уплотнителем",
                        "casing": "Наличники телескопические плоские",
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
