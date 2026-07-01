"""
从用户提供的高分辨率 logo 裁切出"渐变方块"部分，生成多尺寸图标。
- 裁掉底部"OPC AI 智能体"文字
- 居中成正方形（透明背景）
- 4×超采样抗锯齿后缩放
- 输出 16/32/48/128/256 五种尺寸
"""
from PIL import Image
import os

SRC = r'D:\extension\小卡去水印下载\logo\logo.png'
OUTPUT_DIR = r'D:\extension\小卡去水印下载'
ICONS_DIR = os.path.join(OUTPUT_DIR, 'icons')

# 检测出的边界（已通过像素分析确认）
CROP_TOP = 20      # 包含渐变方块上方的少量边距
CROP_BOTTOM = 175  # 裁掉文字区域
CROP_LEFT = 50     # 居中方块，去除左侧空白
CROP_RIGHT = 210   # 居中方块


def find_auto_crop_box(img: Image.Image, threshold: int = 10) -> tuple:
    """
    自动检测方块边界（不依赖硬编码值）：
    返回 (left, top, right, bottom) 紧贴内容的方块
    """
    w, h = img.size
    pixels = img.load()

    # 从上往下找第一行有内容的
    top = 0
    for y in range(h):
        for x in range(w):
            if pixels[x, y][3] > threshold:
                top = y
                break
        if top:
            break

    # 从下往上找最后一行有内容的
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if pixels[x, y][3] > threshold:
                bottom = y
                break
        if bottom != h - 1:
            break

    # 找上下之间的"主方块"边界（连续宽行）
    in_block = False
    block_start = 0
    blocks = []
    for y in range(top, bottom + 1):
        row_count = 0
        for x in range(w):
            if pixels[x, y][3] > threshold:
                row_count += 1
        if row_count > 50:  # 方块的行宽度阈值
            if not in_block:
                block_start = y
                in_block = True
        else:
            if in_block:
                blocks.append((block_start, y - 1))
                in_block = False
    if in_block:
        blocks.append((block_start, bottom))

    if not blocks:
        return (0, 0, w, h)

    # 取最大块的边界
    main_block = max(blocks, key=lambda b: b[1] - b[0])
    main_top, main_bottom = main_block

    # 在 main_top ~ main_bottom 范围内找左右边界
    left = w
    right = 0
    for y in range(main_top, main_bottom + 1):
        for x in range(w):
            if pixels[x, y][3] > threshold:
                left = min(left, x)
                right = max(right, x)

    return (left, main_top, right + 1, main_bottom + 1)


def crop_to_square(img: Image.Image, box: tuple, padding: int = 8) -> Image.Image:
    """裁切出内容区域并居中成正方形（带 padding）"""
    left, top, right, bottom = box
    cropped = img.crop(box)
    cw, ch = cropped.size
    side = max(cw, ch) + padding * 2

    # 创建透明正方形底
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    # 居中粘贴
    ox = (side - cw) // 2
    oy = (side - ch) // 2
    square.paste(cropped, (ox, oy), cropped if cropped.mode == 'RGBA' else None)
    return square


def make_size(square_img: Image.Image, size: int) -> Image.Image:
    """4×超采样后再 LANCZOS 缩放，保证抗锯齿"""
    scale = 4
    big = square_img.resize((size * scale, size * scale), Image.LANCZOS)
    return big.resize((size, size), Image.LANCZOS)


def main():
    src = Image.open(SRC).convert('RGBA')
    print(f'原图: {src.size}')

    # 自动检测主方块
    box = find_auto_crop_box(src)
    print(f'检测到的方块边界: {box}')
    print(f'方块尺寸: {box[2]-box[0]} × {box[3]-box[1]}')

    # 裁切成正方形
    square = crop_to_square(src, box, padding=12)
    print(f'正方形画布: {square.size}')

    # 生成各尺寸
    os.makedirs(ICONS_DIR, exist_ok=True)
    sizes = {
        'logo.png': 128,
        'icons/icon16.png': 16,
        'icons/icon32.png': 32,
        'icons/icon48.png': 48,
        'icons/icon128.png': 128,
        'icons/icon256.png': 256,  # 备份大图
    }

    for rel, sz in sizes.items():
        path = os.path.join(OUTPUT_DIR, rel)
        out = make_size(square, sz)
        out.save(path, 'PNG', optimize=True)
        print(f'  ✅ {rel} ({sz}x{sz})')

    print('\n✨ 全部完成。')


if __name__ == '__main__':
    main()
