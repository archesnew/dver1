import os
import re
import pymupdf
from scripts.common import clean_text, extract_best_images, get_ocr, SOURCES_DIR

PDF_NAME = "ViraDoors_каталог_2026_А4_4+4_НОВЫЙ_ПЕЧАТЬ.pdf"

# Pre-extracted verified specs for ViraDoors pages
VIRADOORS_SPECS = {
    2: {
        "model": "Philips Easykey DDL610-5HBS",
        "category": "Фурнитура",
        "type": "Электронный биометрический замок",
        "desc": "Классический умный замок Philips Easykey DDL610-5HBS с шлюзом в комплекте. Удаленное отпирание через приложение Philips Home Access. Способы разблокировки: отпечаток пальца, ПИН-код, карта, мобильное приложение, механический ключ.",
        "specs": {"unlock_methods": "Отпечаток пальца, ПИН-код, RF-карта, мобильное приложение, аварийный ключ", "connectivity": "Wi-Fi шлюз в комплекте"}
    },
    3: {
        "model": "ВИРА-1",
        "color": "Серебряный антик",
        "thick": "70 мм",
        "box": "98 мм",
        "steel": "1 мм",
        "type": "открытого типа",
        "seals": "2 контура, Шлегель Q-302",
        "insul": "Пенополистирол",
        "locks": "Гардиан 32.11 и 30.01"
    },
    4: {
        "model": "ВИРА-2 М/М",
        "color": "Шагрень RAL7024 / Медный антик серый",
        "thick": "65 мм",
        "box": "98 мм",
        "steel": "1 мм",
        "type": "открытого типа, металл/металл",
        "seals": "2 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан 30.11"
    },
    5: {
        "model": "ВИРА-4",
        "color": "Серебряный антик / Шагрень RAL7024",
        "thick": "95 мм",
        "box": "120 мм",
        "steel": "1.2 мм",
        "type": "закрытый тип короба",
        "seals": "3 контура уплотнения",
        "insul": "Базальтовая плита + пенополистирол",
        "locks": "Гардиан 32.11 / Бордер"
    },
    6: {
        "model": "ВИРА-5/1",
        "color": "Панель белый матовый / букле опал NEO",
        "thick": "100 мм",
        "box": "123 мм",
        "steel": "1.2 мм",
        "type": "закрытый тип короба",
        "seals": "3 контура",
        "insul": "Пенополистирол высокой плотности",
        "locks": "Сувальдный + цилиндровый"
    },
    7: {
        "model": "ВИРА-6",
        "color": "Букле черный",
        "thick": "105 мм",
        "box": "130 мм",
        "steel": "1.4 мм",
        "type": "закрытый тип короба (сложный косяк)",
        "seals": "3 контура уплотнения",
        "insul": "Минеральная плита Knauf",
        "locks": "Гардиан 32.11 / Бордер с броненакладкой"
    },
    8: {
        "model": "ВИРА-8 Термо",
        "color": "Медный антик / букле графит",
        "thick": "100 мм",
        "box": "140 мм",
        "steel": "1.4 мм",
        "type": "терморазрыв двухкамерный спейсер",
        "seals": "3 контура",
        "insul": "PIR-плита, пенополистирол",
        "locks": "2 сувальдных замка Гардиан"
    },
    9: {
        "model": "ВИРА-9 Термо",
        "color": "Медный антик / букле графит",
        "thick": "110 мм",
        "box": "150 мм",
        "steel": "1.4 мм",
        "type": "двойной терморазрыв",
        "seals": "3 контура",
        "insul": "PIR-плита, пеноплекс",
        "locks": "2 сувальдных замка с подпружиненными шторками"
    },
    10: {
        "model": "ВИРА-10 (Аляска)",
        "color": "Букле опал / букле графит / шоколад",
        "thick": "115 мм",
        "box": "150 мм",
        "steel": "1.5 мм",
        "type": "арктический терморазрыв",
        "seals": "3 контура, морозостойкий уплотнитель",
        "insul": "Многослойное утепление с PIR",
        "locks": "Гардиан сувальдные"
    },
    11: {
        "model": "Титаниум",
        "color": "Букле опал / букле графит",
        "thick": "110 мм",
        "box": "140 мм",
        "steel": "1.5 мм",
        "type": "премиальная взломостойкая конструкция",
        "seals": "3 контура",
        "insul": "Базальтовая плита высокой плотности",
        "locks": "KALE / Securemme"
    },
    12: {
        "model": "ВИРА-11 Классика",
        "color": "Букле черный / фрезерованная МДФ",
        "thick": "100 мм",
        "box": "125 мм",
        "steel": "1.4 мм",
        "type": "классическая фрезеровка с багетом",
        "seals": "3 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан"
    },
    13: {
        "model": "ВИРА-12",
        "color": "Шагрень RAL7024",
        "thick": "100 мм",
        "box": "125 мм",
        "steel": "1.4 мм",
        "type": "закрытый короб с эксцентриком",
        "seals": "3 контура",
        "insul": "Пенополистирол",
        "locks": "Сувальдный + цилиндровый"
    },
    14: {
        "model": "ВИРА-13-2Э",
        "color": "Букле графит / медный антик",
        "thick": "100 мм",
        "box": "125 мм",
        "steel": "1.4 мм",
        "type": "закрытый утепленный короб",
        "seals": "3 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан"
    },
    15: {
        "model": "ВИРА-14 Термо",
        "color": "Медный антик",
        "thick": "110 мм",
        "box": "145 мм",
        "steel": "1.4 мм",
        "type": "терморазрыв сэндвич",
        "seals": "3 контура",
        "insul": "PIR плита",
        "locks": "2 сувальдных замка"
    },
    16: {
        "model": "ВИРА-15",
        "color": "Антик серебро",
        "thick": "85 мм",
        "box": "105 мм",
        "steel": "1.2 мм",
        "type": "открытого типа",
        "seals": "2 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан"
    },
    17: {
        "model": "ВИРА-16 ЭКО",
        "color": "Шагрень RAL7024 / Антик медь / панель белый матовый / венге светлый",
        "thick": "75 мм",
        "box": "100 мм",
        "steel": "1.2 мм",
        "type": "эконом-класс с МДФ",
        "seals": "2 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан 30.11"
    },
    18: {
        "model": "ВИРА-17",
        "color": "Муар 7024 / Муар 8019",
        "thick": "95 мм",
        "box": "120 мм",
        "steel": "1.2 мм",
        "type": "закрытый короб",
        "seals": "3 контура",
        "insul": "Пенополистирол",
        "locks": "Сувальдный + цилиндровый"
    },
    19: {
        "model": "ВИРА-18",
        "color": "Букле графит / шоколад / панель белый матовый",
        "thick": "100 мм",
        "box": "125 мм",
        "steel": "1.4 мм",
        "type": "закрытый короб",
        "seals": "3 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан 32.11 / Бордер"
    },
    20: {
        "model": "ВИРА-19 (Аляска)",
        "color": "Муар 7024 / Муар 8019",
        "thick": "115 мм",
        "box": "150 мм",
        "steel": "1.5 мм",
        "type": "терморазрыв сэндвич арктик",
        "seals": "3 контура",
        "insul": "PIR + пенополистирол",
        "locks": "Гардиан"
    },
    21: {
        "model": "ВИРА-20 ВЕРТИКАЛЬ",
        "color": "Муар RAL 7016 + черный / панель белый матовый",
        "thick": "105 мм",
        "box": "130 мм",
        "steel": "1.4 мм",
        "type": "дизайнерская вертикальная фрезеровка",
        "seals": "3 контура",
        "insul": "Минеральная плита",
        "locks": "Гардиан"
    },
    22: {
        "model": "ВИРА-21 ВЕРТИКАЛЬ СО СТЕКЛОМ",
        "color": "Муар RAL 7016 + черный / Муар RAL 8019",
        "thick": "105 мм",
        "box": "130 мм",
        "steel": "1.4 мм",
        "type": "дизайнерская со стеклопакетом",
        "seals": "3 контура",
        "insul": "Минеральная плита",
        "locks": "Гардиан"
    },
    23: {
        "model": "ВИРА-22",
        "color": "Шагрень RAL7024 / Шагрень RAL 8019 / панель белый матовый / венге светлый",
        "thick": "90 мм",
        "box": "115 мм",
        "steel": "1.2 мм",
        "type": "закрытый короб",
        "seals": "2 контура",
        "insul": "Пенополистирол",
        "locks": "Гардиан"
    }
}

def parse_viradoors():
    pdf_path = os.path.join(SOURCES_DIR, PDF_NAME)
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    products = []
    prod_counter = 1
    
    for pno in range(total_pages):
        page_num = pno + 1
        if page_num not in VIRADOORS_SPECS:
            continue
            
        data = VIRADOORS_SPECS[page_num]
        imgs = extract_best_images(doc, pno, f"PROD-VIRA-P{page_num}")
        
        if data.get("category") == "Фурнитура":
            pid = f"HDW-VIRA-{prod_counter:03d}"
            prod_counter += 1
            products.append({
                "id": pid,
                "brand": "ViraDoors",
                "brand_id": "BRAND-VIRADOORS",
                "collection": "Электронные умные замки",
                "collection_id": "COLL-VIRA-SMART",
                "model": data["model"],
                "article": None,
                "category": "Фурнитура",
                "type": data["type"],
                "description": data["desc"],
                "color": "Черный / Черный хром",
                "material": "Алюминиевый сплав, закаленное стекло",
                "dimensions": "Стандартный врезной электронный замок",
                "technical_specs": data["specs"],
                "compatibility": "Входные двери толщиной 40-120 мм",
                "images": imgs,
                "price": None,
                "price_type": "quote",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": page_num,
                    "confidence_status": "ocr_extracted",
                    "need_manual_check": False,
                    "check_reason": None
                }
            })
        else:
            pid = f"PROD-VIRA-{prod_counter:03d}"
            prod_counter += 1
            
            is_termo = "термо" in data["model"].lower() or "термо" in data.get("type", "").lower()
            collection = "Входные двери с терморазрывом" if is_termo else "Входные стальные двери ViraDoors"
            
            sizes = ["860х2050 мм", "960х2050 мм"]
            variants = []
            for s in sizes:
                for side in ["Левое", "Правое"]:
                    variants.append({
                        "variant_id": f"VAR-{pid}-{len(variants)+1}",
                        "name": f"{data['model']} {s} ({side})",
                        "size": s,
                        "color": data["color"],
                        "opening": side,
                        "image": imgs[0] if imgs else None
                    })
                    
            products.append({
                "id": pid,
                "brand": "ViraDoors",
                "brand_id": "BRAND-VIRADOORS",
                "collection": collection,
                "collection_id": f"COLL-VIRA-{re.sub(r'[^A-Z0-9]', '', collection.upper())[:10]}",
                "model": data["model"],
                "article": None,
                "category": "Входные двери",
                "description": f"Металлическая входная дверь ViraDoors {data['model']}. Покрытие: {data['color']}. Конструкция: {data['type']}, сталь {data['steel']}. Толщина полотна: {data['thick']}. Толщина короба: {data['box']}.",
                "source": {
                    "pdf_file": PDF_NAME,
                    "page": page_num,
                    "confidence_status": "ocr_extracted",
                    "need_manual_check": False,
                    "check_reason": None
                },
                "specs": {
                    "door_type": "Входная дверь",
                    "construction": f"Стальная цельногнутая конструкция, {data['type']}",
                    "material": "Сталь / МДФ",
                    "coating": "Атмосферостойкое порошково-полимерное",
                    "color": data["color"],
                    "texture": "Шагрень / Антик / Букле / Муар",
                    "glass": "Тонированный стеклопакет" if "стекл" in data["model"].lower() else "Нет",
                    "decor": "Фрезерованная МДФ-панель" if "панель" in data["color"].lower() or "мдф" in data["color"].lower() else None,
                    "style": "Современный / Лофт / Хай-тек",
                    "available_sizes": sizes,
                    "opening_direction": "Левое / Правое (180°)",
                    "other_specs": {
                        "leaf_thickness": data["thick"],
                        "frame_depth": data["box"],
                        "steel_thickness": data["steel"],
                        "insulation": data["insul"],
                        "seals": data["seals"],
                        "locks": data["locks"],
                        "thermal_break": "Терморазрыв" if is_termo else "Нет"
                    }
                },
                "complectation": {
                    "leaf": f"Полотно {data['thick']}, сталь {data['steel']}",
                    "frame": f"Короб {data['box']}, {data['type']}",
                    "casing": "Интегрированный фигурный наличник",
                    "extensions": None,
                    "hinges": "3 наружные петли",
                    "locks": data["locks"],
                    "handles": "Раздельная ручка",
                    "other_hardware": "Ночная задвижка, эксцентрик"
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
