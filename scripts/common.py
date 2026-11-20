import os
import re
import io
import pymupdf
from PIL import Image

OUTPUT_DIR = "data/catalog-output"
IMG_DIR = os.path.join(OUTPUT_DIR, "catalog-images")
SOURCES_DIR = "data/catalog-sources"

_ocr_instance = None

def get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_instance = RapidOCR()
    return _ocr_instance

def clean_text(text):
    if not text:
        return ""
    # Normalize spaces, non-breaking spaces, quotes
    t = text.replace('\xa0', ' ').replace('\u200b', '').replace('\ufeff', '')
    t = re.sub(r'[ \t]+', ' ', t)
    return t.strip()

def save_page_render(doc, page_num, out_name, clip=None, dpi=150):
    """Render page or clip to PNG and save to catalog-images."""
    page = doc[page_num]
    pix = page.get_pixmap(dpi=dpi, clip=clip)
    rel_path = f"catalog-images/{out_name}.png"
    full_path = os.path.join(OUTPUT_DIR, rel_path)
    pix.save(full_path)
    return rel_path

def extract_best_images(doc, page_num, prefix, max_imgs=3, min_dim=80):
    """
    Extract embedded raster images from page, or render page if no good raster found.
    Returns list of relative paths.
    """
    page = doc[page_num]
    imgs = page.get_images()
    saved = []
    
    # Filter and sort by size (width*height)
    candidates = []
    for idx, img_info in enumerate(imgs):
        xref = img_info[0]
        smask = img_info[1]
        try:
            pix = pymupdf.Pixmap(doc, xref)
            w, h = pix.width, pix.height
            if w >= min_dim and h >= min_dim:
                # Skip pure grayscale masks if they don't have RGB
                candidates.append((w * h, xref, smask, idx, pix))
        except Exception:
            continue
            
    candidates.sort(key=lambda x: x[0], reverse=True)
    
    for i, (area, xref, smask, idx, pix) in enumerate(candidates[:max_imgs]):
        try:
            out_name = f"{prefix}_img{i+1}"
            rel_path = f"catalog-images/{out_name}.png"
            full_path = os.path.join(OUTPUT_DIR, rel_path)
            
            # If colorspace is not RGB, convert
            if pix.n >= 5: # CMYK
                pix_rgb = pymupdf.Pixmap(pymupdf.csRGB, pix)
            else:
                pix_rgb = pix
                
            if smask > 0:
                try:
                    mask = pymupdf.Pixmap(doc, smask)
                    if mask.width == pix_rgb.width and mask.height == pix_rgb.height:
                        combined = pymupdf.Pixmap(pix_rgb, mask)
                        combined.save(full_path)
                        saved.append(rel_path)
                        continue
                except Exception:
                    pass
                    
            pix_rgb.save(full_path)
            saved.append(rel_path)
        except Exception as e:
            continue
            
    if not saved:
        # Fallback to rendering page
        out_name = f"{prefix}_page"
        rel_path = save_page_render(doc, page_num, out_name, dpi=120)
        saved.append(rel_path)
        
    return saved
