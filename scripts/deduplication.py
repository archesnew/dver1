import re

def normalize_name(name):
    if not name:
        return ""
    n = name.lower()
    # Normalize ru/en lookalikes
    n = n.replace("a", "а").replace("e", "е").replace("o", "о").replace("p", "р").replace("c", "с").replace("x", "х")
    n = re.sub(r'[^а-я0-9]', '', n)
    return n

def find_duplicates(all_doors, all_hardware):
    duplicates_report = []
    
    # 1. Door duplicates by normalized model name
    door_by_norm = {}
    for d in all_doors:
        m = d["model"]
        norm = normalize_name(m)
        if len(norm) < 3:
            continue
        door_by_norm.setdefault(norm, []).append(d)
        
    for norm, items in door_by_norm.items():
        if len(items) > 1:
            # Check if across different catalogs or brands
            brands = set(it["brand"] for it in items)
            catalogs = set(it["source"]["pdf_file"] for it in items)
            if len(catalogs) > 1 or len(brands) > 1:
                duplicates_report.append({
                    "type": "cross_catalog_model_overlap",
                    "normalized_key": norm,
                    "sample_model": items[0]["model"],
                    "count": len(items),
                    "items": [{
                        "id": it["id"],
                        "brand": it["brand"],
                        "collection": it["collection"],
                        "model": it["model"],
                        "source": it["source"]["pdf_file"],
                        "page": it["source"]["page"]
                    } for it in items],
                    "recommendation": "Модели с идентичным наименованием в разных каталогах (например, между моно-каталогом фабрики и сборным каталогом «Двери Голливуда»). Рекомендуется объединить в карточке с указанием альтернативных источников или закрепить за фабрикой-производителем оригинала."
                })
                
    # 2. Hardware duplicates by article or normalized name
    hw_by_art = {}
    for h in all_hardware:
        art = h.get("article")
        if art:
            hw_by_art.setdefault(str(art).strip(), []).append(h)
            
    for art, items in hw_by_art.items():
        if len(items) > 1:
            brands = set(it["brand"] for it in items)
            duplicates_report.append({
                "type": "hardware_shared_article",
                "article": art,
                "count": len(items),
                "items": [{
                    "id": it["id"],
                    "brand": it["brand"],
                    "model": it["model"],
                    "type": it["type"],
                    "source": it["source"]["pdf_file"],
                    "page": it["source"]["page"]
                } for it in items],
                "recommendation": "Одинаковый артикул. Проверить на соответствие одной OEM-платформе или разделить по бренду."
            })
            
    return duplicates_report
