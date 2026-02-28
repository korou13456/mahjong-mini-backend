const path = require("path");
require("dotenv").config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});

const https = require("https");
const db = require("../../config/database");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY 未配置");
}

/* ================================
   🔥 批量 Prompt 构建
================================ */

function buildBatchPrompt(products) {
  const basePrompt = `
      You are a strict e-commerce product title parser.

      IMPORTANT:
      The core product category is "blanket".
      DO NOT extract or output:
      - blanket
      - throw blanket
      - fleece blanket
      - bed blanket
      - any phrase containing the word "blanket"

      Task:
      Analyze MULTIPLE product titles and extract structured keywords.

      INPUT FORMAT:
      Each title is prefixed with an index number.

      Output format:

      #<index>
      type|keyword|normalized_keyword

      Rules:
      1. NO explanations.
      2. NO markdown.
      3. DO NOT invent information.
      4. One line = one minimal semantic unit.
      5. Avoid duplicates.
      6. Skip meaningless product base words.
      7. DO NOT output any keyword containing the word "blanket".

      Strict type definitions:

      THEME:
      - Only concrete subjects or conceptual themes.
      - Examples: bear, rabbit, christmas, memorial, galaxy
      - NOT quality words.

      ATTRIBUTE:
      - Material (faux rabbit fur, fleece)
      - Physical traits (soft, fluffy, durable)
      - Quality (high_quality)
      - Functional (machine washable)
      - Print/technique

      USAGE:
      - Physical usage places only (bed, sofa, travel)

     AUDIENCE:
      - Explicit target people only.
      - Examples: kids, women, men, adult, couple, mom, dad, family
      - DO NOT output generic marketing words like:
        gift, present, perfect gift, great gift
      - If no clear target people exist, DO NOT output audience.

      Normalization:
      - lowercase
      - singular noun
      - snake_case
      - remove redundant adjectives

      Now analyze:
      `;

  let content = "";
  products.forEach((p, index) => {
    content += `#${index}\n${p.title}\n\n`;
  });

  return basePrompt + content;
}

/* ================================
   🔥 调用 DeepSeek
================================ */

async function callDeepSeek(prompt) {
  const data = JSON.stringify({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: "你是一个严格的商品标题结构化解析助手，只输出指定格式内容。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.deepseek.com",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result.choices[0].message.content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/* ================================
   🔥 解析批量返回
================================ */

function parseBatchResult(content) {
  const result = {};
  let currentIndex = null;

  const lines = content.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      currentIndex = line.replace("#", "").trim();
      result[currentIndex] = [];
      continue;
    }

    if (!currentIndex || !line.includes("|")) continue;

    const [type, keyword, normalized] = line.split("|");

    if (!type || !keyword || !normalized) continue;

    result[currentIndex].push({
      category: "blanket",
      keyword: keyword.trim(),
      keywordType: type.trim(),
      normalizedKeyword: normalized.trim(),
    });
  }

  return result;
}

/* ================================
   🔥 keyword_dimension 表
================================ */

async function getOrCreateKeyword({
  category,
  keywordType,
  normalizedKeyword,
}) {
  try {
    const [result] = await db.query(
      `INSERT INTO keyword_dimension
       (category, keyword_type, normalized_keyword, created_at)
       VALUES (?, ?, ?, NOW())`,
      [category, keywordType, normalizedKeyword],
    );

    return result.insertId;
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const [rows] = await db.query(
        `SELECT id
         FROM keyword_dimension
         WHERE category = ? AND normalized_keyword = ?`,
        [category, normalizedKeyword],
      );

      return rows[0]?.id;
    }
    throw err;
  }
}

/* ================================
   🔥 product_keyword_relation 表
================================ */

async function insertProductKeywordRelation({ productId, keywordId, keyword }) {
  await db.query(
    `INSERT IGNORE INTO product_keyword_relation
     (product_id, keyword_id, keyword, source, created_at)
     VALUES (?, ?, ?, 'deepseek_ai', NOW())`,
    [productId, keywordId, keyword],
  );
}

/* ================================
   🔥 主执行逻辑
================================ */

async function run() {
  const batchSize = 10;

  const [products] = await db.query(
    `SELECT id, product_id, title
     FROM product
     WHERE title IS NOT NULL
       AND title != ''
       AND DATE(updated_at) = CURDATE()`,
  );

  console.log(`读取到 ${products.length} 条商品`);

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    console.log(`\n处理批次 ${i / batchSize + 1}，共 ${batch.length} 条`);

    const prompt = buildBatchPrompt(batch);

    let aiResult;
    try {
      aiResult = await callDeepSeek(prompt);
    } catch (err) {
      console.error("AI 调用失败:", err.message);
      continue;
    }

    const parsed = parseBatchResult(aiResult);

    for (let index in parsed) {
      const product = batch[index];
      const keywords = parsed[index];

      if (!product || !keywords) continue;

      console.log(`\n商品: ${product.title}`);
      console.log("AI 解析结果:");
      keywords.forEach((k) => {
        console.log(
          `  ${k.keywordType} | ${k.keyword} | ${k.normalizedKeyword}`,
        );
      });
      console.log("-".repeat(40));

      for (const k of keywords) {
        try {
          const id = await getOrCreateKeyword(k);

          await insertProductKeywordRelation({
            productId: product.product_id,
            keywordId: id,
            keyword: k.keyword,
          });
        } catch (err) {
          console.error(`关键词入库失败: ${k.normalizedKeyword}`, err.message);
        }
      }
    }

    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log("\n✅ 全部解析完成");
}

run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
