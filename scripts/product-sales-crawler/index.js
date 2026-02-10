const axios = require("axios");
require("dotenv").config({
  path: require("path").resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});
const db = require("../../config/database");

const API_URL = "https://api.temaishuju.com/api/v1/goods/card";
const REGION = "211"; // 地区固定为211（美国）

// 调用API获取商品销量数据
async function fetchProductSales(goodsId, mallId, cookie, referer) {
  const url = `${API_URL}?goodsId=${goodsId}&mallId=${mallId}&region=${REGION}`;

  const headers = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  };

  if (cookie) headers.Cookie = cookie;
  if (referer) headers.Referer = referer;

  const response = await axios.get(url, { headers });

  // 检测反爬JS
  if (
    typeof response.data === "string" &&
    response.data.startsWith("<script")
  ) {
    throw new Error("接口返回了反爬JS，可能被拦截了");
  }

  return response.data;
}

// 将API返回的销量历史数据映射为数据库记录
function mapSalesHistory(productId, historyData) {
  return historyData.map((item) => {
    const createDate = new Date(item.createTime);
    const orderDate = createDate.toISOString().split("T")[0]; // YYYY-MM-DD格式
    return {
      product_id: productId,
      order_date: orderDate,
      order_count: item.daySold || 0,
    };
  });
}

// 批量插入或更新每日销量数据
async function upsertSalesData(salesData) {
  if (salesData.length === 0) return;

  const sql = `
    INSERT INTO product_sales_daily (product_id, order_date, order_count)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      order_count = VALUES(order_count)
  `;

  const values = salesData.map((item) => [
    item.product_id,
    item.order_date,
    item.order_count,
  ]);

  await db.query(sql, [values]);
}

// 获取最近7天的日期范围
function getRecentDateRange(days = 7) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

// 过滤最近7天的数据
function filterRecentData(data, startDate, endDate) {
  return data.filter((item) => {
    return item.order_date >= startDate && item.order_date <= endDate;
  });
}

// 处理单个商品的销量数据
async function processProductSales(product) {
  try {
    console.log(
      `正在处理商品: ${product.title} (ID: ${product.product_id}, MallID: ${product.shop_id})`,
    );

    const result = await fetchProductSales(product.product_id, product.shop_id);

    if (result.code !== 0 || !result.data?.history) {
      console.warn(`商品 ${product.product_id} 无销量历史数据或API返回错误`);
      return;
    }

    // 映射销量数据
    const salesData = mapSalesHistory(product.id, result.data.history);

    // 获取最近7天的日期范围
    const { startDate, endDate } = getRecentDateRange(7);

    // 过滤最近7天的数据
    const recentSalesData = filterRecentData(salesData, startDate, endDate);

    if (recentSalesData.length === 0) {
      console.log(`商品 ${product.product_id} 最近7天无销量数据`);
      return;
    }

    // 插入数据库
    await upsertSalesData(recentSalesData);

    console.log(
      `商品 ${product.product_id} 处理完成，插入了 ${recentSalesData.length} 条销量数据`,
    );
  } catch (error) {
    console.error(`处理商品 ${product.product_id} 失败:`, error.message);
    throw error;
  }
}

// 获取所有商品数据
async function getAllProducts() {
  const [rows] = await db.query(
    `SELECT id, shop_id, product_id, title FROM product WHERE status = 1`,
  );
  return rows;
}

// 批量获取商品销量数据
async function crawlProductSales() {
  console.log("开始获取商品销量数据...");

  try {
    // 获取所有商品
    const products = await getAllProducts();

    if (products.length === 0) {
      console.log("没有需要处理的商品");
      return;
    }

    console.log(`找到 ${products.length} 个商品，开始获取销量数据`);

    let successCount = 0;
    let errorCount = 0;

    // 逐个处理商品（避免请求过快）
    for (const product of products) {
      try {
        await processProductSales(product);
        successCount++;

        // 延迟请求，避免请求过快被限制
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`处理商品 ${product.product_id} 失败:`, error.message);
        errorCount++;
      }
    }

    console.log(
      `销量数据获取完成！总共处理 ${products.length} 个商品，成功 ${successCount} 个，失败 ${errorCount} 个`,
    );
  } catch (error) {
    console.error("获取商品销量数据失败:", error);
    throw error;
  }
}

// 导出函数供其他模块使用
module.exports = { crawlProductSales };

// 如果直接运行此脚本
if (require.main === module) {
  crawlProductSales()
    .then(() => {
      console.log("销量数据获取任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("销量数据获取任务执行失败:", error);
      process.exit(1);
    });
}
