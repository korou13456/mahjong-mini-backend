const path = require("path");
require("dotenv").config({
  path: path.resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});

const db = require("../../config/database");

/**
 * 1. 获取今天新增的 product_keyword_relation 里的小词和关联商品及大词信息
 */
async function getTodayVariantKeywords() {
  // 关联 keyword_dimension 取 category 和 keyword_type
  const [rows] = await db.query(
    `SELECT pkr.keyword, pkr.product_id, kd.category, kd.keyword_type, kd.normalized_keyword
     FROM product_keyword_relation pkr
     JOIN keyword_dimension kd ON pkr.keyword_id = kd.id
     WHERE DATE(pkr.created_at) = CURDATE()`,
  );
  return rows;
}

/**
 * 2. 根据商品ID列表查询销量
 */
async function getSalesByProductIds(productIds) {
  if (!productIds.length) return {};

  const [rows] = await db.query(
    `SELECT product_id, sales
     FROM product_raw
     WHERE product_id IN (?) AND crawl_time = CURDATE()`,
    [productIds],
  );

  const salesMap = {};
  rows.forEach((r) => {
    salesMap[r.product_id] = r.sales || 0;
  });
  return salesMap;
}

/**
 * 3. upsert 小词销量聚合结果
 */
async function upsertVariantResult({
  category,
  normalizedKeyword,
  keyword,
  keywordType,
  totalSales,
}) {
  const [existing] = await db.query(
    `SELECT id
     FROM category_keyword_variant_sales
     WHERE category = ?
       AND normalized_keyword = ?
       AND keyword = ?
       AND stat_date = CURDATE()`,
    [category, normalizedKeyword, keyword],
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE category_keyword_variant_sales
       SET total_sales = ?, updated_at = NOW()
       WHERE id = ?`,
      [totalSales, existing[0].id],
    );
  } else {
    await db.query(
      `INSERT INTO category_keyword_variant_sales
       (category, normalized_keyword, keyword, keyword_type, total_sales, stat_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURDATE(), NOW(), NOW())`,
      [category, normalizedKeyword, keyword, keywordType, totalSales],
    );
  }
}

/**
 * 4. 主流程：直接聚合小词销量
 */
async function aggregateVariantSales() {
  console.log("=== 小词销量聚合开始 ===\n");

  const variants = await getTodayVariantKeywords();
  console.log(`获取到 ${variants.length} 条今日新增小词记录`);

  // 统计小词对应的商品ID集合
  const variantMap = {}; // { keyword: { category, normalizedKeyword, keywordType, productIds: [] } }

  for (const v of variants) {
    if (!variantMap[v.keyword]) {
      variantMap[v.keyword] = {
        category: v.category,
        normalizedKeyword: v.normalized_keyword,
        keywordType: v.keyword_type,
        productIds: [],
      };
    }
    variantMap[v.keyword].productIds.push(v.product_id);
  }

  let processed = 0;

  for (const keyword of Object.keys(variantMap)) {
    const { category, normalizedKeyword, keywordType, productIds } =
      variantMap[keyword];

    const salesMap = await getSalesByProductIds(productIds);

    let totalSales = 0;
    for (const pid of productIds) {
      totalSales += salesMap[pid] || 0;
    }

    await upsertVariantResult({
      category,
      normalizedKeyword,
      keyword,
      keywordType,
      totalSales,
    });

    console.log(`  ✔ 小词入库: ${keyword} | 销量=${totalSales}`);

    processed++;
  }

  console.log(`\n✅ 聚合完成，共处理 ${processed} 个小词`);
}

// 执行
aggregateVariantSales()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ 错误:", err);
    process.exit(1);
  });
