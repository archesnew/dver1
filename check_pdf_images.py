import os
import pymupdf as fitz

pdf_dir = 'data/catalog-sources'

def check_page_images(pdf_name, page_num):
    path = os.path.join(pdf_dir, pdf_name)
    doc = fitz.open(path)
    # page_num is 1-indexed
    p = doc[page_num - 1]
    imgs = p.get_images()
    print(f"=== {pdf_name} (Page {page_num}) ===")
    print(f"  Rect: {p.rect}")
    print(f"  Total embedded images on page: {len(imgs)}")
    for i, img_info in enumerate(imgs):
        xref = img_info[0]
        base_img = doc.extract_image(xref)
        w, h = base_img["width"], base_img["height"]
        ext = base_img["ext"]
        print(f"    Img {i+1} (xref {xref}): {w}x{h} ({ext})")
    doc.close()

check_page_images("Chameleon Doors каталог 01.03.2026.pdf", 8)
check_page_images("ViraDoors_каталог_2026_А4_4+4_НОВЫЙ_ПЕЧАТЬ.pdf", 3)
check_page_images("Каталог феррони 05-2026 (mngst) (4).pdf", 4)
check_page_images("Каталог Двери Голливуда 2026г.pdf", 9)
check_page_images("Двери 2025.pdf", 1)
check_page_images("Каталог FSD 07-10-2025-2 цвета разв.pdf", 2)
