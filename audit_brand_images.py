import json, os
from PIL import Image
from collections import defaultdict

products = json.load(open('data/catalog-output/products.json', encoding='utf-8'))
img_dir = 'data/catalog-output'

brand_summary = defaultdict(lambda: {
    'total': 0,
    'page_as_main': 0,
    'shared_main': 0,
    'multi_images': 0,
    'aspect_ratios': []
})

main_img_counts = defaultdict(int)
for p in products:
    main_img = p.get('images', [None])[0]
    if main_img:
        main_img_counts[main_img] += 1

for p in products:
    b = p.get('brand', 'Unknown')
    s = brand_summary[b]
    s['total'] += 1
    
    imgs = p.get('images', [])
    if len(imgs) > 1:
        s['multi_images'] += 1
        
    main_img = imgs[0] if imgs else None
    if main_img:
        if '_page' in main_img:
            s['page_as_main'] += 1
        if main_img_counts[main_img] > 1:
            s['shared_main'] += 1
            
        full_path = os.path.join(img_dir, main_img)
        if os.path.exists(full_path):
            try:
                im = Image.open(full_path)
                w, h = im.size
                ratio = round(h / w, 2)
                s['aspect_ratios'].append(ratio)
            except Exception:
                pass

print("=== ТЕКУЩИЙ АУДИТ ГЛАВНЫХ ИЗОБРАЖЕНИЙ ПО БРЕНДАМ ===")
for b, s in sorted(brand_summary.items()):
    ratios = s['aspect_ratios']
    avg_ratio = round(sum(ratios)/len(ratios), 2) if ratios else 0
    min_r = min(ratios) if ratios else 0
    max_r = max(ratios) if ratios else 0
    print(f"Бренд: {b:28} | Всего: {s['total']:3} | _page: {s['page_as_main']:3} | Shared: {s['shared_main']:3} | H/W ratio: min={min_r} max={max_r} avg={avg_ratio}")
