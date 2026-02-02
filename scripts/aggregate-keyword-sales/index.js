const path = require("path");
require("dotenv").config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});

const db = require("../../config/database");

/**
 * 1. 获取今日新增的大词
 */
async function getTodayKeywords() {
  const [rows] = await db.query(
    `SELECT id, category, keyword_type, normalized_keyword
     FROM keyword_dimension
     WHERE DATE(created_at) = CURDATE()`,
  );
  return rows;
}

/**
 * 2. 一次性拉取「今日」 keyword -> product -> sales
 */
async function getKeywordProductSalesMap(keywordIds) {
  if (!keywordIds.length) return {};

  const [rows] = await db.query(
    `
    SELECT
      pkr.keyword_id,
      pr.sales
    FROM product_keyword_relation pkr
    JOIN product_raw pr
      ON pkr.product_id = pr.product_id
     AND pr.crawl_time = CURDATE()   -- ✅ 只算今天
    WHERE pkr.keyword_id IN (?)
    `,
    [keywordIds],
  );

  /**
   * {
   *   keywordId: [sales, sales...]
   * }
   */
  const map = {};
  for (const row of rows) {
    if (!map[row.keyword_id]) map[row.keyword_id] = [];
    map[row.keyword_id].push(row.sales || 0);
  }

  return map;
}

/**
 * 3. upsert 聚合结果
 */
async function upsertAggregateResult({
  category,
  normalizedKeyword,
  keywordType,
  totalSales,
  salesRank,
}) {
  const [existing] = await db.query(
    `SELECT id
     FROM category_keyword_sales_aggregate
     WHERE category = ?
       AND keyword_type = ?
       AND normalized_keyword = ?
       AND stat_date = CURDATE()`,
    [category, keywordType, normalizedKeyword],
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE category_keyword_sales_aggregate
       SET total_sales = ?, sales_rank = ?, updated_at = NOW()
       WHERE id = ?`,
      [totalSales, salesRank, existing[0].id],
    );
  } else {
    await db.query(
      `INSERT INTO category_keyword_sales_aggregate
       (category, keyword_type, normalized_keyword, total_sales, sales_rank, stat_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURDATE(), NOW(), NOW())`,
      [category, keywordType, normalizedKeyword, totalSales, salesRank],
    );
  }
}

/**
 * 4. 主流程
 */
async function aggregateKeywordSales() {
  console.log("=== 大词销量聚合（今日 + 按类型排名）===\n");

  const keywords = await getTodayKeywords();
  console.log(`获取到 ${keywords.length} 个今日新增关键词`);

  if (!keywords.length) return [];

  const keywordIds = keywords.map((k) => k.id);

  const keywordSalesMap = await getKeywordProductSalesMap(keywordIds);

  const results = [];

  for (const k of keywords) {
    const salesList = keywordSalesMap[k.id] || [];
    if (!salesList.length) continue;

    const totalSales = salesList.reduce((s, v) => s + v, 0);

    results.push({
      category: k.category,
      keywordType: k.keyword_type,
      normalizedKeyword: k.normalized_keyword,
      totalSales,
    });
  }

  /**
   * 5. 按 category + keyword_type 分组排名
   */
  const grouped = {};
  for (const r of results) {
    const key = `${r.category}__${r.keywordType}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  for (const key of Object.keys(grouped)) {
    const list = grouped[key];
    list.sort((a, b) => b.totalSales - a.totalSales);

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const rank = i + 1;

      await upsertAggregateResult({
        category: r.category,
        keywordType: r.keywordType,
        normalizedKeyword: r.normalizedKeyword,
        totalSales: r.totalSales,
        salesRank: rank,
      });

      console.log(
        `✔ ${r.category} | ${r.keywordType} | ${r.normalizedKeyword} 销量=${r.totalSales} 排名=${rank}`,
      );
    }
  }

  console.log("\n✅ 聚合完成");
  return results;
}

// 执行
aggregateKeywordSales()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 错误:", err);
    process.exit(1);
  });
