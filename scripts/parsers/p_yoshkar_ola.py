import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "ДВЕРИ ЙОШКАР ОЛА 2026.pdf"

def parse_yoshkar_ola():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno == 0 or pno == 31 or pno == 41:
            # P1 cover, P32 disclaimer, P42 back cover
            continue
            
        imgs = extract_best_images(doc, pno, f"PROD-YOSH-P{pno+1}")
        
        if pno >= 1 and pno <= 30:
            # ENTRANCE DOORS
            # Extract title
            model_name = ""
            for l in lines[:4]:
                if "Входная дверь" in l:
                    model_name = l.replace("Входная дверь -", "").replace("Входная дверь с зеркалом -", "").replace("Входная дверь", "").strip(" -–")
                    break
            if not model_name and lines:
                model_name = lines[0]
                
            collection = "Входные двери с терморазрывом" if any(k in model_name.upper() for k in ["ТЕРМО", "TERMO"]) else "Входные металлические двери"
            if "зеркало" in model_name.lower() or "mirror" in model_name.lower():
                collection = "Входные двери с зеркалом"
            elif "эконом" in model_name.lower():
                collection = "Входные двери Эконом"
                
            # Specs extraction
            coating = "Порошково-полимерное антивандальное покрытие"
            leaf_thick = "100 мм"
            steel_thick = "1.2-1.5 мм"
            box_depth = "120-148 мм"
            sizes = ["860х2050 мм", "960х2080 мм"]
            glass = "Нет"
            decor = None
            locks = "Замковая система сувальдный + цилиндровый"
            
            for l in lines:
                if "толщина полотна" in l.lower():
                    leaf_thick = l.split(":", 1)[-1].strip() if ":" in l else l
                elif "толщина стали" in l.lower():
                    steel_thick = l.split(":", 1)[-1].strip() if ":" in l else l
                elif "глубина короба" in l.lower():
                    box_depth = l.split(":", 1)[-1].strip() if ":" in l else l
                elif "размеры" in l.lower():
                    sz_part = l.split(":", 1)[-1].strip() if ":" in l else l
                    sz_matches = re.findall(r'\d{3,4}\s*[\*хx]\s*\d{3,4}', sz_part)
                    if sz_matches:
                        sizes = [f"{s.replace('*', 'х').replace('x', 'х')} мм" for s in sz_matches]
                elif "стеклопакет" in l.lower():
                    glass = l
                elif "зеркало" in l.lower():
                    glass = "Встроенное зеркало"
                    decor = "Зеркальная вставка"
                    
            pid = f"PROD-YOSH-{prod_counter:03d}"
            prod_counter += 1
            
            variants = []
            for s in sizes:
                for side in ["Левое", "Правое"]:
                    variants.append({
                        "variant_id": f"VAR-{pid}-{len(variants)+1}",
                        "name": f"{model_name} {s} ({side})",
                        "size": s,
                        "color": "Стандарт",
                        "opening": side,
                        "image": imgs[0] if imgs else None
                    })
                    
            products.append({
                "id": pid,
                "brand": "Йошкар-Ола",
                "brand_id": "BRAND-YOSHKAR-OLA",
                "collection": collection,
                "collection_id": f"COLL-YOSH-{re.sub(r'[^A-Z0-9]', '', collection.upper())[:10]}",
                "model": model_name,
                "article": None,
                "category": "Входные двери",
                "description": f"Входная дверь Йошкар-Ола {model_name}. Толщина полотна: {leaf_thick}. Толщина стали: {steel_thick}. Короб закрытый утепленный глубиной {box_depth}.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": pno + 1,
                    "confidence_status": "verified",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Входная дверь",
                    "construction": "Цельногнутая стальная конструкция с закрытым утепленным коробом",
                    "material": "Сталь / МДФ",
                    "coating": coating,
                    "color": "Муар Графит / Букле / Цинкогрунт / Опал / Медь",
                    "texture": "Шагрень / Букле / Муар / МДФ панель",
                    "glass": glass,
                    "decor": decor,
                    "style": "Современный / Неоклассика",
                    "available_sizes": sizes,
                    "opening_direction": "Левое / Правое (180°)",
                    "other_specs": {
                        "leaf_thickness": leaf_thick,
                        "steel_thickness": steel_thick,
                        "frame_depth": box_depth,
                        "thermal_break": "Полиамидный терморазрыв" if "термо" in collection.lower() else "Нет",
                        "stainless_sill": "Порог из нержавеющей стали зеркальный" if "порог из нержавеющей" in text.lower() else None
                    }
                },
                "complectation": {
                    "leaf": f"Полотно {leaf_thick}, сталь {steel_thick}",
                    "frame": f"Короб закрытый утепленный {box_depth}",
                    "casing": "Интегрированный металлический наличник",
                    "extensions": None,
                    "hinges": "3 наружные петли на упорных подшипниках",
                    "locks": locks,
                    "handles": "Раздельная ручка",
                    "other_hardware": "Ночная задвижка, эксцентрик, глазок (для моделей без зеркала)"
                },
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "variants": variants
            })
            
        elif pno >= 32 and pno <= 40:
            # INTERIOR DOORS (Pages 33 to 41)
            # Find models on page
            page_models = []
            for l in lines:
                if l.lower().startswith("модель "):
                    m = l.replace("модель", "").strip()
                    if m and m not in page_models:
                        page_models.append(m)
                elif any(l.strip() == k for k in ["Афина 1", "Афина 2", "Селена", "Аттика", "Горизонт", "Оазис", "Люми", "Астра", "Корсика"]):
                    if l.strip() not in page_models:
                        page_models.append(l.strip())
                        
            if not page_models:
                page_models = [f"Межкомнатная дверь Стр.{pno+1}"]
                
            # Specs for interior doors on this page
            coating = "ПВХ" if "пвх" in text.lower() else "Эмаль / ПВХ"
            fill = "МДФ" if "мдф" in text.lower() else "Сосна по периметру"
            sizes = ["2000х600 мм", "2000х700 мм", "2000х800 мм", "2000х900 мм"]
            colors = []
            for l in lines:
                if l.startswith("Цвет:"):
                    c = l.replace("Цвет:", "").strip()
                    if c and c not in colors:
                        colors.append(c)
            color_str = ", ".join(colors) if colors else "По каталогу (Белый, Латте, Топленое молоко, Песчаный рай)"
            
            for m in page_models:
                pid = f"PROD-YOSH-{prod_counter:03d}"
                prod_counter += 1
                
                variants = []
                for s in sizes:
                    for c in (colors or ["Стандарт"]):
                        variants.append({
                            "variant_id": f"VAR-{pid}-{len(variants)+1}",
                            "name": f"{m} {s} {c}",
                            "size": s,
                            "color": c,
                            "opening": "Универсальное",
                            "image": imgs[0] if imgs else None
                        })
                        
                products.append({
                    "id": pid,
                    "brand": "Йошкар-Ола",
                    "brand_id": "BRAND-YOSHKAR-OLA",
                    "collection": "Межкомнатные двери Йошкар-Ола",
                    "collection_id": "COLL-YOSH-INT",
                    "model": m,
                    "article": None,
                    "category": "Межкомнатные двери",
                    "description": f"Межкомнатная дверь {m}. Покрытие: {coating}. Внутреннее заполнение: {fill}. Доступные цвета: {color_str}.",
                    "source": {
                        "pdf_file": PDF_NAME,
                        "page": pno + 1,
                        "confidence_status": "verified",
                        "need_manual_check": False,
                        "check_reason": None
                    },
                    "specs": {
                        "door_type": "Межкомнатная дверь",
                        "construction": "Каркасно-щитовая / царговая",
                        "material": "МДФ / сосна",
                        "coating": coating,
                        "color": color_str,
                        "texture": "Гладкая матовая / древесная",
                        "glass": "Остекление сатинат / лакобель" if any(w in m.lower() for w in ["остекл", "dg", "стекло"]) else "Глухое полотно",
                        "decor": "Фрезеровка / багет",
                        "style": "Классика / Неоклассика / Модерн",
                        "available_sizes": sizes,
                        "opening_direction": "Универсальное (левое / правое)",
                        "other_specs": {
                            "filling": fill,
                            "molding_system": "Телескопический погонаж"
                        }
                    },
                    "complectation": {
                        "leaf": "Дверное полотно 2000х600/700/800/900 мм",
                        "frame": "Телескопическая коробка МДФ/сэндвич 2070х75 мм",
                        "casing": "Наличники телескопические 2150х70 мм (или 2180х80 мм)",
                        "extensions": "Доборы телескопические 2070х90, 130, 170, 210 мм",
                        "hinges": "Приобретаются отдельно (универсальные / скрытые)",
                        "locks": "Приобретаются отдельно (магнитные / сантехнические)",
                        "handles": "Приобретаются отдельно",
                        "other_hardware": "Притворная планка (для распашных двупольных дверей)"
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
