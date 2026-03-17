const Tesseract = require("tesseract.js");
const sharp = require("sharp");

/**
 * 判断是否是有效文本
 */
function isMeaningfulText(text, confidence) {
  if (!text) return false;
  const clean = text.replace(/\s+/g, "");

  if (confidence < 30) return false;
  if (clean.length < 3) return false;

  const hasWord = /[a-zA-Z0-9]{2,}|[\u4e00-\u9fa5]{2,}/.test(text);
  if (!hasWord) return false;

  return true;
}

/**
 * 按行拆分
 */
function splitTextLines(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * 去重 + 合并文本
 */
function mergeTexts(results) {
  const linesSet = new Set();

  results.forEach((r) => {
    if (r.text) {
      splitTextLines(r.text).forEach((line) => {
        if (line.length > 2) {
          linesSet.add(line);
        }
      });
    }
  });

  return Array.from(linesSet);
}

/**
 * 并发控制
 */
async function runWithLimit(tasks, limit = 3) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (e) {
        results[i] = e;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/**
 * 🔥 图片增强
 */
async function preprocess(imageBuffer) {
  return sharp(imageBuffer)
    .resize({ width: 800 }) // 放大
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(150) // 二值化
    .toBuffer();
}

/**
 * 🔥 裁三块（核心）
 */
async function cropRegions(buffer) {
  const meta = await sharp(buffer).metadata();

  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width < 10 || height < 10) {
    return [buffer, buffer, buffer];
  }

  // 👉 安全计算
  const middleTop = Math.floor(height * 0.2);
  const middleHeight = Math.floor(height * 0.5);

  const bottomTop = Math.floor(height * 0.5);
  const bottomHeight = height - bottomTop;

  // ✅ 每次都 new sharp（关键）
  const safeExtract = async (opts) => {
    try {
      return await sharp(buffer)
        .extract({
          left: 0,
          top: Math.max(0, Math.min(opts.top, height - 1)),
          width: Math.min(width, width),
          height: Math.max(1, Math.min(opts.height, height - opts.top)),
        })
        .toBuffer();
    } catch (e) {
      console.warn("裁剪失败，降级原图:", e.message);
      return buffer;
    }
  };

  return Promise.all([
    // 1️⃣ 整图
    buffer,

    // 2️⃣ 中间
    safeExtract({
      top: middleTop,
      height: middleHeight,
    }),

    // 3️⃣ 底部
    safeExtract({
      top: bottomTop,
      height: bottomHeight,
    }),
  ]);
}

/**
 * OCR执行
 */
async function doOCR(buffer, index, tag) {
  const {
    data: { text, confidence },
  } = await Tesseract.recognize(buffer, "eng", {
    tessedit_pageseg_mode: 11, // 稀疏文本（最强）
    logger: (m) => {
      if (m.status === "recognizing text") {
        console.log(`[${index + 1}][${tag}] ${(m.progress * 100).toFixed(1)}%`);
      }
    },
  });

  return { text: text.trim(), confidence };
}

/**
 * 单图识别（🔥三块 + 合并）
 */
async function recognizeOne(imageUrl, index, total) {
  try {
    console.log(`开始识别 ${index + 1}/${total}`);

    const res = await fetch(imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());

    // 1️⃣ 预处理
    const processed = await preprocess(buffer);

    // 2️⃣ 裁三块
    const regions = await cropRegions(processed);

    // 3️⃣ 三次 OCR
    const ocrResults = await Promise.all([
      doOCR(regions[0], index, "full"),
      doOCR(regions[1], index, "middle"),
      doOCR(regions[2], index, "bottom"),
    ]);

    // 4️⃣ 合并结果
    const mergedLines = mergeTexts(ocrResults);
    const finalText = mergedLines.join("\n");

    const avgConfidence =
      ocrResults.reduce((sum, r) => sum + r.confidence, 0) / ocrResults.length;

    const meaningful = isMeaningfulText(finalText, avgConfidence);

    console.log(
      `完成 ${index + 1}/${total} | 置信度: ${avgConfidence.toFixed(2)}`,
    );

    return {
      image: imageUrl,
      text: meaningful ? finalText : null,
      lines: mergedLines,
      confidence: avgConfidence,
      hasText: meaningful,
      success: true,
    };
  } catch (err) {
    console.error("识别失败:", err.message);
    return {
      image: imageUrl,
      text: null,
      lines: [],
      hasText: false,
      success: false,
    };
  }
}

/**
 * 主接口
 */
async function recognizeImageText(req, res) {
  const { images } = req.body;

  if (!images || !Array.isArray(images)) {
    return res.json({ code: 400, message: "参数错误" });
  }

  const tasks = images.map(
    (img, i) => () => recognizeOne(img, i, images.length),
  );

  const results = await runWithLimit(tasks, 3);

  res.json({
    code: 200,
    data: {
      total: images.length,
      results,
    },
  });
}

module.exports = recognizeImageText;
