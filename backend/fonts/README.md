# PDF 中文字体（pdfmake）

模板 PDF 需要 **OpenType (.otf)** 字体，文件名：

- `NotoSansCJKsc-Regular.otf`（必需）
- `NotoSansCJKsc-Bold.otf`（可选，缺失时用 Regular 代替）

## 自动下载

```bash
cd backend
node scripts/ensure-pdf-fonts.mjs
```

`npm install` 的 postinstall 也会尝试下载（约 16MB/个，需能访问 jsDelivr 或 GitHub）。

## 手动放置

若服务器无法访问外网，请从 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/SimplifiedChinese) 下载上述文件，放到本目录。

## Zeabur

构建阶段执行 `npm install` 时会下载；也可在环境变量中指定镜像：

`PDF_FONT_REGULAR_URL=https://你的镜像/NotoSansCJKsc-Regular.otf`
