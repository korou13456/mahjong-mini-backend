const { backendAuth } = require("../../middleware/backend-auth");
const Tesseract = require("tesseract.js");
const sharp = require("sharp"); // 新增依赖，用于处理小图

/**
 * 判断是否是"有意义文本"
 */
function isMeaningfulText(text, confidence) {
  if (!text) return false;

  const clean = text.replace(/\s+/g, "");

  if (confidence < 35) return false;
  if (clean.length < 3) return false;
  const hasWord = /[a-zA-Z]{2,}|[\u4e00-\u9fa5]{2,}/.test(text);
  if (!hasWord) return false;

  const tokens = text.split(/\s+/);
  const validTokens = tokens.filter((t) => t.length >= 2);
  if (validTokens.length < 1) return false;

  const validCharCount = (clean.match(/[a-zA-Z0-9\u4e00-\u9fa5]/g) || [])
    .length;
  if (validCharCount / clean.length < 0.5) return false;

  return true;
}

/**
 * 按行拆分文本
 */
function splitTextLines(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * 并发控制（无依赖版本）
 */
async function runWithLimit(tasks, limit = 3) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (err) {
        results[currentIndex] = err;
      }
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * 放大小图
 */
async function ensureMinWidth(imageBuffer, minWidth = 50) {
  const img = sharp(imageBuffer);
  const metadata = await img.metadata();

  if (metadata.width >= minWidth) return imageBuffer;

  const scale = minWidth / metadata.width;
  return img.resize(Math.round(metadata.width * scale)).toBuffer();
}

/**
 * OCR识别单张图片
 */
async function recognizeOne(imageUrl, index, total) {
  try {
    console.log(`开始识别 ${index + 1}/${total}: ${imageUrl}`);

    // 先获取图片 buffer
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    let imgBuffer = Buffer.from(buffer);

    // 自动放大小图
    imgBuffer = await ensureMinWidth(imgBuffer, 50);

    const {
      data: { text, confidence },
    } = await Tesseract.recognize(imgBuffer, "eng", {
      tessedit_pageseg_mode: 6,
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`  [${index + 1}] ${(m.progress * 100).toFixed(1)}%`);
        }
      },
    });

    const trimmedText = text.trim();
    const meaningful = isMeaningfulText(trimmedText, confidence);
    const lines = meaningful ? splitTextLines(trimmedText) : [];

    console.log(
      `完成 ${index + 1}/${total} | 置信度: ${confidence.toFixed(
        2,
      )} | 有效文本: ${meaningful}`,
    );

    return {
      image: imageUrl,
      text: meaningful ? trimmedText : null,
      lines,
      confidence,
      hasText: meaningful,
      success: true,
    };
  } catch (error) {
    console.error(`识别失败 ${index + 1}:`, error.message);
    return {
      image: imageUrl,
      text: null,
      lines: [],
      hasText: false,
      success: false,
      error: error.message,
    };
  }
}

/**
 * 主接口
 */
async function recognizeImageText(req, res) {
  try {
    const { images } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.json({
        code: 400,
        message: "请提供图片地址数组",
        data: null,
      });
    }

    const tasks = images.map((img, i) => {
      return () => recognizeOne(img, i, images.length);
    });

    const results = await runWithLimit(tasks, 3);

    res.json({
      code: 200,
      message: "识别完成",
      data: {
        total: images.length,
        withText: results.filter((r) => r.hasText).length,
        withoutText: results.filter((r) => !r.hasText).length,
        results,
      },
    });
  } catch (error) {
    console.error("图片文字识别失败:", error);

    res.status(500).json({
      code: 500,
      message: "服务器错误",
      data: null,
    });
  }
}

module.exports = recognizeImageText;
