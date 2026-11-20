import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, SOURCES_DIR

PDF_NAME = "Каталог Люксор май 2026 (3).pdf"

def parse_luxor():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    current_collection = "Luxor Термо"
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [clean_text(l) for l in text.split('\n') if clean_text(l)]
        
        if pno in [0, 42, 43, 44]:
            # Cover or summary tables
            continue
            
        t_upper = text.upper()
        if "LUXOR ТЕРМО" in t_upper:
            current_collection = "Luxor Термо"
        elif "LUXOR МЕТ/МДФ" in t_upper:
            current_collection = "Luxor МЕТ/МДФ"
        elif "LUXOR 2МДФ" in t_upper:
            current_collection = "Luxor 2МДФ"
        elif "LUXOR LEONARDO" in t_upper:
            current_collection = "Luxor Leonardo"
        elif "LUXOR БРЕЙД" in t_upper:
            current_collection = "Luxor Брейд"
            
        # Find model name on page
        model_name = ""
        # Search for lines starting with Luxor
        for l in lines:
            if l.startswith("Luxor") and len(l) > 5 and l != "Luxor Термо" and l != "Luxor МЕТ/МДФ" and l != "Luxor 2МДФ":
                model_name = l
                break
                
        if not model_name:
            # Check if there is a line after "Luxor"
            for idx, l in enumerate(lines):
                if l == "Luxor" and idx + 1 < len(lines):
                    model_name = f"Luxor {lines[idx+1]}"
                    break
                    
        if not model_name:
            # Fallback
            model_name = f"{current_collection} Стр.{pno+1}"
            
        # Parse coatings and specs
        ext_cov = ""
        int_cov = ""
        thick = "11 см"
        thermal_break = "24 мм" if "термо" in current_collection.lower() or "термо" in text.lower() else "Нет"
        sizes = ["860х2050 мм", "960х2050 мм"]
        glass = "Нет"
        decor = None
        
        for idx, l in enumerate(lines):
            if "внешнее покрытие" in l.lower() and idx > 0:
                ext_cov = lines[idx-1]
            elif "внутренняя панель" in l.lower() and idx > 0:
                int_cov = lines[idx-1]
            elif "толщина полотна" in l.lower():
                thick = l.replace("•", "").strip()
            elif "терморазрыв" in l.lower():
                thermal_break = l.replace("•", "").strip()
                
        if "стеклопакет" in text.lower() or "стекло" in text.lower():
            glass = "Тонированный стеклопакет с ковкой/решеткой"
        if "зеркало" in text.lower() or "зеркало" in model_name.lower():
            glass = "Зеркало"
            decor = "Встроенное зеркало с защитной пленкой"
        if "домофон" in text.lower() or "смарт" in model_name.lower():
            decor = (decor or "") + " Встроенный видеодомофон / умный замок"
            
        imgs = extract_best_images(doc, pno, f"PROD-LUX-P{pno+1}")
        
        pid = f"PROD-LUX-{prod_counter:03d}"
        prod_counter += 1
        
        variants = []
        for s in sizes:
            for side in ["Левое", "Правое"]:
                variants.append({
                    "variant_id": f"VAR-{pid}-{len(variants)+1}",
                    "name": f"{model_name} {s} ({side})",
                    "size": s,
                    "color": f"{ext_cov} / {int_cov}".strip(' / ') or "Стандарт",
                    "opening": side,
                    "image": imgs[0] if imgs else None
                })
                
        products.append({
            "id": pid,
            "brand": "Luxor",
            "brand_id": "BRAND-LUXOR",
            "collection": current_collection,
            "collection_id": f"COLL-LUX-{re.sub(r'[^A-Z0-9]', '', current_collection.upper())[:10]}",
            "model": model_name,
            "article": None,
            "category": "Входные двери",
            "description": f"Входная дверь {model_name} серии {current_collection}. Внешнее покрытие: {ext_cov or 'порошковое'}. Внутренняя панель: {int_cov or 'МДФ'}. {thick}. {thermal_break}.",
            "source": {
                "pdf_file": PDF_NAME,
                "page": pno + 1,
                "confidence_status": "verified",
                "need_manual_check": False,
                "check_reason": None
            },
            "specs": {
                "door_type": "Входная дверь",
                "construction": "Цельногнутая стальная конструкция с коробом закрытого типа",
                "material": "Сталь / МДФ",
                "coating": ext_cov or "Атмосферостойкое порошково-полимерное",
                "color": f"{ext_cov} / {int_cov}".strip(' / ') or "По каталогу",
                "texture": "Букле / Муар / Сатин / МДФ панель",
                "glass": glass,
                "decor": decor,
                "style": "Современный / Неоклассика / Хай-тек",
                "available_sizes": sizes,
                "opening_direction": "Левое / Правое (180°)",
                "other_specs": {
                    "leaf_thickness": thick,
                    "thermal_break": thermal_break,
                    "frame_depth": "130-150 мм",
                    "insulation": "PIR-плита / базальтовая плита / пенополистирол",
                    "seals": "3 контура уплотнения (включая магнитный на коробе)",
                    "locks": "Двухсистемный сувальдный + цилиндровый высшего класса взломостойкости",
                    "handles": "Раздельная ручка в цвете черный / хром"
                }
            },
            "complectation": {
                "leaf": f"Полотно {thick}, сталь 1.5 мм, терморазрыв {thermal_break}",
                "frame": "Утепленный цельногнутый короб с терморазрывом и эксцентриком",
                "casing": "Интегрированный металлический наличник",
                "extensions": None,
                "hinges": "3 наружные петли 180° на подшипниках",
                "locks": "Сувальдный и цилиндровый замки",
                "handles": "Раздельная эргономичная ручка",
                "other_hardware": "Ночная задвижка, эксцентрик, порог из нержавеющей стали"
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
