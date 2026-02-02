const path = require("path");
require("dotenv").config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env"
  ),
});

const https = require("https");
const db = require("../../config/database");

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY 未配置");
}

/**
 * 调用 DeepSeek 解析商品标题
 * 强制：一行 = 一个最小语义单元
 */
async function callDeepSeek(title) {
  const prompt = `
    Analyze the product title and extract keywords.

    Product Title:
    ${title}

    Rules:
    1. Extract keywords only (NO arrays, NO explanations, NO markdown)
    2. Each line must strictly follow this format:
      <type>|<keyword>|<normalized_keyword>
    3. Do NOT invent keywords that are not explicitly implied by the title
    4. Avoid duplicates and semantic overlaps

    Types definition (VERY IMPORTANT):
    - theme: Core emotional / conceptual theme (e.g. personalized, bear, love, memorial)
      ❌ Product types or physical items can NOT be themes
      ❌ blanket / throw blanket / fleece blanket are NOT themes
    - attribute: Physical characteristics, product types, materials, print methods, personalization forms
      ✅ blanket / throw blanket / photo blanket / digital print / custom name
    - usage: Usage scenarios or places
    - audience: Target people or relationships

    Special rules:
    - For titles like "personalized photo blanket", the theme MUST be:
      theme|personalized|personalized
    - blanket / throw blanket MUST be classified as attribute, NOT theme
    - If no clear emotional or conceptual theme exists, DO NOT force a theme

    Normalization rules:
    - Use singular nouns
    - Merge similar meanings (e.g. teddy bear / sleeping bear -> bear)
    - Use snake_case when needed
    - Normalized keyword should be lowercase

    Example:
    theme|personalized|personalized
    attribute|throw blanket|throw_blanket
    attribute|photo blanket|photo_blanket
    attribute|digital print|digital_print
    usage|living room|living_room
    audience|family|family

    Return ONLY the lines above.
    `;

  const data = JSON.stringify({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "你是一个专业的商品标题语义解析助手，只输出严格格式化的关键词结果。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
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

/**
 * 解析 AI 返回结果
 * 每一行 -> 一条入库记录
 */
function parseDeepSeekResult(content) {
  const keywords = [];

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l.includes("|"));

  for (const line of lines) {
    const first = line.indexOf("|");
    const last = line.lastIndexOf("|");

    if (first === -1 || last === first) {
      console.warn("⚠️ 非法 AI 行，已跳过:", line);
      continue;
    }

    const type = line.slice(0, first).trim();
    const keyword = line.slice(first + 1, last).trim();
    const normalizedKeyword = line
      .slice(last + 1)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

    keywords.push({
      category: "blanket",
      keyword,
      keywordType: type,
      normalizedKeyword,
    });
  }

  return keywords;
}

/**
 * keyword_dimension 表：去重 + 插入
 */
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
      [category, keywordType, normalizedKeyword]
    );

    console.log(
      `  ✅ 插入 keyword_dimension: ${normalizedKeyword} (id=${result.insertId})`
    );
    return result.insertId;
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      const [rows] = await db.query(
        `SELECT id
         FROM keyword_dimension
         WHERE category = ? AND normalized_keyword = ?`,
        [category, normalizedKeyword]
      );

      if (!rows.length) {
        throw new Error(
          `Duplicate keyword but not found: ${category} | ${normalizedKeyword}`
        );
      }

      console.log(
        `  ℹ️  已存在 keyword_dimension: ${normalizedKeyword} (id=${rows[0].id})`
      );
      return rows[0].id;
    }
    throw err;
  }
}
/**
 * product_keyword_relation 表：去重 + 插入
 */
async function insertProductKeywordRelation({
  productId,
  keywordId,
  keyword,
  source = "deepseekAI",
}) {
  try {
    const [result] = await db.query(
      `INSERT IGNORE INTO product_keyword_relation
       (product_id, keyword_id, keyword, source, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [productId, keywordId, keyword, source]
    );

    if (result.affectedRows > 0) {
      console.log(
        `  ✅ 插入 product_keyword_relation: product_id=${productId}, keyword_id=${keywordId}`
      );
    } else {
      console.log(
        `  ℹ️  已存在 product_keyword_relation: product_id=${productId}, keyword_id=${keywordId}`
      );
    }
  } catch (err) {
    console.error("❌ 插入 product_keyword_relation 失败:", err.message);
  }
}

/**
 * 主执行逻辑
 */
async function run() {
  const [products] = await db.query(
    `SELECT product_id, title
     FROM product_raw
     WHERE title IS NOT NULL
       AND title != ''
       AND crawl_time = CURDATE()`
  );

  console.log(`读取到 ${products.length} 条【今日采集】商品`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    console.log(`\n[${i + 1}/${products.length}] 商品 ${product.product_id}`);
    console.log(product.title);

    let aiResult;
    try {
      aiResult = await callDeepSeek(product.title);
    } catch (err) {
      console.error(
        `❌ AI 调用失败 product_id=${product.product_id}:`,
        err.message
      );
      continue;
    }

    console.log(aiResult, "!==>>aiResult");

    if (!aiResult || !aiResult.includes("|")) {
      console.warn(`⚠️ AI 返回异常 product_id=${product.product_id}`);
      continue;
    }

    const keywords = parseDeepSeekResult(aiResult);

    for (const k of keywords) {
      try {
        const id = await getOrCreateKeyword(k);

        await insertProductKeywordRelation({
          productId: product.product_id,
          keywordId: id,
          keyword: k.keyword,
          source: "deepseek ai",
        });
      } catch (error) {
        console.error(
          `❌ 关键词入库失败: product_id=${product.product_id}, ` +
            `keyword=${k.keyword}, normalized=${k.normalizedKeyword}, ` +
            `error=${error.message}`
        );
      }
    }

    // 节流
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n✅ 今日商品全部解析完成");
}

/**
 * CLI 参数
 */
const args = process.argv.slice(2);
const limit = Number(args[0]) || 20;
const offset = Number(args[1]) || 0;

run(limit, offset)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
