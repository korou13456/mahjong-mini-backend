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
 * 后处理单行文本 - 修正常见OCR错误
 */
function postProcessLine(line) {
  if (!line || line.length < 2) return line;
  
  // 修正常见OCR错误
  let processed = line;
  
  // 尺寸格式修正：60"x80" (Hot) -> 60"x80" (Hot)
  processed = processed
    // 修正尺寸中的x字符
    .replace(/(\d+)\s*[x×]\s*(\d+)/gi, '$1x$2')
    // 修正引号
    .replace(/''/g, '"')
    .replace(/'/g, '"')
    // 修正数字0和字母O
    .replace(/([A-Za-z])0([A-Za-z])/g, '$1O$2')
    .replace(/(\d)O(\d)/g, '$10$2')
    // 修正数字1和字母l
    .replace(/([A-Za-z])l([A-Za-z])/g, '$11$2')
    // 移除多余的空格
    .replace(/\s+/g, ' ')
    .trim();
  
  return processed;
}

/**
 * 去重 + 合并文本 + 后处理
 */
function mergeTexts(results) {
  const linesSet = new Set();

  results.forEach((r) => {
    if (r.text) {
      splitTextLines(r.text).forEach((line) => {
        if (line.length > 2) {
          const processedLine = postProcessLine(line);
          if (processedLine.length > 2) {
            linesSet.add(processedLine);
          }
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
 * 🔥 图片增强 - 优化双策略预处理（保证准确性版）
 */
async function preprocessMultiple(imageBuffer) {
  const base = sharp(imageBuffer);
  const metadata = await base.metadata();
  const width = metadata.width || 0;
  
  // 保证准确性：不使用最大宽度限制，保持原始图像细节
  // 优化策略：只保留最有效的两种策略
  const strategies = [
    {
      name: "standard",
      processor: base
        .clone()
        .resize({ width: Math.max(800, width) })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1 })
        .threshold(150)
    },
    {
      name: "high_contrast",
      processor: base
        .clone()
        .resize({ width: Math.max(1000, Math.floor(width * 1.5)) })
        .grayscale()
        .normalize({ lower: 5, upper: 95 })
        .sharpen({ sigma: 1.5 })
        .median(1)
    }
  ];
  
  // 并行执行预处理
  const processingPromises = strategies.map(async (strategy) => {
    try {
      const buffer = await strategy.processor.toBuffer();
      return {
        name: strategy.name,
        buffer
      };
    } catch (error) {
      console.warn(`预处理策略 ${strategy.name} 失败:`, error.message);
      return null;
    }
  });
  
  const results = await Promise.all(processingPromises);
  return results.filter(result => result !== null);
}

/**
 * 🔥 裁三块（优化版）- 增加顶部和底部区域
 */
async function cropRegions(buffer) {
  const meta = await sharp(buffer).metadata();

  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width < 10 || height < 10) {
    return [buffer, buffer, buffer]; // 返回三个相同缓冲区
  }

  // 👉 安全计算三个区域
  const topHeight = Math.floor(height * 0.3); // 顶部30%
  const middleTop = Math.floor(height * 0.3); // 中间从30%开始
  const middleHeight = Math.floor(height * 0.4); // 中间40%
  const bottomTop = Math.floor(height * 0.7); // 底部从70%开始
  const bottomHeight = Math.floor(height * 0.3); // 底部30%

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

    // 2️⃣ 顶部区域（标题、品牌等）
    safeExtract({
      top: 0,
      height: topHeight,
    }),

    // 3️⃣ 中间区域（主要文本、尺寸表）
    safeExtract({
      top: middleTop,
      height: middleHeight,
    }),

    // 4️⃣ 底部区域（价格、备注等）
    safeExtract({
      top: bottomTop,
      height: bottomHeight,
    }),
  ]);
}

/**
 * OCR执行 - 优化双模式尝试（保证准确性版）
 */
async function doOCR(buffer, index, tag) {
  // 保证准确性：并行执行两种PSM模式
  const psmModes = [
    { mode: 11, name: "sparse" }, // 稀疏文本（最适合表格、尺寸图）
    { mode: 6, name: "uniform" }, // 统一文本块（适合普通文本）
  ];
  
  const ocrPromises = psmModes.map(async ({ mode, name }) => {
    try {
      const { data: { text, confidence } } = await Tesseract.recognize(buffer, "eng", {
        tessedit_pageseg_mode: mode,
        // 优化参数
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\\.\\,\\:\\;\\!\\?\\"\\\'\\-\\_\\=\\+\\*\\/\\\\(\\\\)\\[\\]\\{\\}\\<\\>\\&\\%\\$\\#\\@\\|\\\\\\~\\`\\^\\ \\t\\n\\r\\x22\\x27\\x2D\\x2E\\x2C\\x3A\\x3B\\x21\\x3F\\x28\\x29\\x5B\\x5D\\x7B\\x7D\\x3C\\x3E\\x26\\x25\\x24\\x23\\x40\\x7C\\x5C\\x7E\\x60\\x5E\\x20',
        tessedit_enable_dict_correction: '0',
        preserve_interword_spaces: '1',
        textord_min_linesize: '2.0',
        logger: (m) => {
          if (m.status === "recognizing text" && mode === 11) { // 只记录主模式
            console.log(`[${index + 1}][${tag}] ${(m.progress * 100).toFixed(1)}%`);
          }
        },
      });
      return { text: text.trim(), confidence, mode: name };
    } catch (error) {
      console.warn(`PSM ${mode} 识别失败:`, error.message);
      return { text: "", confidence: 0, mode: name };
    }
  });
  
  const results = await Promise.all(ocrPromises);
  
  // 选择置信度最高的结果
  const bestResult = results.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );
  
  // 如果所有结果置信度都低于30，返回空
  if (bestResult.confidence < 30) {
    return { text: "", confidence: 0 };
  }
  
  // 记录最佳模式
  console.log(`[${index + 1}][${tag}] 最佳PSM: ${bestResult.mode}, 置信度: ${bestResult.confidence.toFixed(2)}`);
  
  return { text: bestResult.text, confidence: bestResult.confidence };
}

/**
 * 单图识别（🔥优化并行版 + 性能监控）
 */
async function recognizeOne(imageUrl, index, total) {
  const perf = {
    start: Date.now(),
    download: 0,
    preprocess: 0,
    crop: 0,
    ocr: 0,
    merge: 0,
  };
  
  try {
    console.log(`开始识别 ${index + 1}/${total}`);

    // 下载图片
    const downloadStart = Date.now();
    const res = await fetch(imageUrl);
    const buffer = Buffer.from(await res.arrayBuffer());
    perf.download = Date.now() - downloadStart;

    // 1️⃣ 多策略预处理
    const preprocessStart = Date.now();
    const processedImages = await preprocessMultiple(buffer);
    if (processedImages.length === 0) {
      throw new Error("预处理失败");
    }
    perf.preprocess = Date.now() - preprocessStart;

    // 2️⃣ 并行执行所有OCR任务
    const ocrTasks = [];
    let cropTime = 0;
    
    for (const processed of processedImages) {
      const { name: strategyName, buffer: imgBuffer } = processed;
      
      // 两种策略都使用区域裁剪
      const cropStart = Date.now();
      const regions = await cropRegions(imgBuffer);
      cropTime += Date.now() - cropStart;
      
      // 对每个区域执行OCR（现在有4个区域：全图、顶部、中间、底部）
      ocrTasks.push(
        doOCR(regions[0], index, `${strategyName}_full`),
        doOCR(regions[1], index, `${strategyName}_top`),
        doOCR(regions[2], index, `${strategyName}_middle`),
        doOCR(regions[3], index, `${strategyName}_bottom`)
      );
    }
    perf.crop = cropTime;

    // 并行执行所有OCR任务
    const ocrStart = Date.now();
    const allOcrResults = await Promise.all(ocrTasks);
    perf.ocr = Date.now() - ocrStart;

    // 3️⃣ 合并所有结果
    const mergeStart = Date.now();
    const mergedLines = mergeTexts(allOcrResults);
    const finalText = mergedLines.join("\n");
    perf.merge = Date.now() - mergeStart;

    // 计算平均置信度（只考虑有文本的结果）
    const validResults = allOcrResults.filter(r => r.confidence > 0 && r.text && r.text.length > 0);
    const avgConfidence = validResults.length > 0 
      ? validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length
      : 0;

    const meaningful = isMeaningfulText(finalText, avgConfidence);

    const totalTime = Date.now() - perf.start;
    console.log(
      `完成 ${index + 1}/${total} | 策略数: ${processedImages.length} | OCR任务数: ${ocrTasks.length} | 置信度: ${avgConfidence.toFixed(2)} | 有效行: ${mergedLines.length}`,
    );
    console.log(
      `⏱️  性能统计: 总耗时 ${totalTime}ms (下载:${perf.download}ms 预处理:${perf.preprocess}ms 裁剪:${perf.crop}ms OCR:${perf.ocr}ms 合并:${perf.merge}ms)`
    );

    return {
      image: imageUrl,
      text: meaningful ? finalText : null,
      lines: mergedLines,
      confidence: avgConfidence,
      hasText: meaningful,
      success: true,
      perf: {
        total: totalTime,
        download: perf.download,
        preprocess: perf.preprocess,
        crop: perf.crop,
        ocr: perf.ocr,
        merge: perf.merge,
      },
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

  // 保证准确性：使用适中的并发数
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
