const axios = require("axios");
require("dotenv").config({
  path: require("path").resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});
const db = require("../../config/database");

const API_URL = "https://thunt.ai/api/v2/products/list";
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsYW4iOiJjbiIsInZlciI6InNtYiIsInRpbWVzdGFtcCI6MTc3MDE5NDczNywiZXhwaXJlIjoxNzcwNDUzOTM3LCJ1c2VyX2lkIjoiU0ZadFFWNVRhVWc9IiwiYXBwbmFtZSI6IlRIdW50Iiwic3Vic2NyaXB0aW9uIjoie30iLCJlbWFpbCI6ImhvbmdydW1hNDMwQGdtYWlsLmNvbSJ9.EZhE7-KY_xiah5-ir4d0fnWq-S1U1fZsJWOsD1Q3YxQ##a46dc83e8232892aa6d5fad60ed5a3ed";
const BUSINESS_TYPE = "blanket"; // 业务类型
const CATEGORY = "blanket"; // 品类

// 获取指定页面的商品数据
async function fetchProducts(pageNum) {
  const url = `${API_URL}?lang=cn&page_num=${pageNum}&search_key=blanket&pattern=2&store_id=&price_all=&price_us=&price_eu=&category=11898&rating=&rating_us=&rating_eu=&rating_other=&reviews=&reviews_us=&reviews_eu=&reviews_other=&order_day_count=&order_week_count=&order_month_count=&order_count=&day_revenue=&week_revenue=&month_revenue=&total_revenue=&is_local=0&region=211&personalization=0&listed_time=~&sold_out=0&sorted_by=order_day-0`;

  const response = await axios.get(url, {
    headers: {
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      Cookie: "user-uuid1=8;user-plan-id=1;user-plan-expire-at=1772542118",
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      authorization: AUTH_TOKEN,
      "content-type": "application/json",
      priority: "u=1, i",
      referer: "https://thunt.ai/cn/product-database",
      "sec-ch-ua":
        '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
    },
  });

  console.log("========= API 返回数据 =========");
  console.log(JSON.stringify(response.data, null, 2));
  console.log("================================");

  return response.data;
}

// 将API数据映射到数据库表结构
function mapProductData(item) {
  return {
    shop_id: item.store_id || 0,
    main_image: item.logo_url,
    category: CATEGORY,
    product_id: item.product_id,
    title: item.product_name,
    shop_name: item.store_info?.store_name || "",
    business_type: BUSINESS_TYPE,
    status: item.sold_out === 0 ? 1 : 0,
  };
}

// 插入或更新商品数据
async function upsertProduct(product) {
  const sql = `
    INSERT INTO product (shop_id, main_image, category, product_id, title, shop_name, business_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      main_image = VALUES(main_image),
      title = VALUES(title),
      shop_name = VALUES(shop_name),
      status = VALUES(status),
      updated_at = CURRENT_TIMESTAMP
  `;

  await db.query(sql, [
    product.shop_id,
    product.main_image,
    product.category,
    product.product_id,
    product.title,
    product.shop_name,
    product.business_type,
    product.status,
  ]);
}

// 爬取商品数据
async function crawlProducts() {
  console.log("开始爬取 T-Hunt 商品数据...");

  let pageNum = 494;
  const maxPageNum = 500;
  const pageSize = 20;
  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;

  while (pageNum <= maxPageNum) {
    try {
      console.log(`正在获取第 ${pageNum} 页数据...`);

      const result = await fetchProducts(pageNum);

      if (result.code !== 100000) {
        console.error(
          `第 ${pageNum} 页 API 返回错误: code=${result.code}, message=${result.message}`,
        );
        // 如果错误码是10001或10002等授权相关错误，停止爬取
        if (result.code >= 10001) {
          console.error("API授权错误，停止爬取");
          break;
        }
        // 其他错误继续尝试下一页
        pageNum++;
        continue;
      }

      const list = result.data?.list || [];

      if (list.length === 0) {
        console.log(`第 ${pageNum} 页无数据，停止爬取`);
        break;
      }

      console.log(`第 ${pageNum} 页获取到 ${list.length} 条商品数据`);

      // 批量处理商品数据
      for (const item of list) {
        try {
          const product = mapProductData(item);
          await upsertProduct(product);
          successCount++;
        } catch (error) {
          console.error(`处理商品 ${item.product_id} 失败:`, error.message);
          errorCount++;
        }
      }

      totalProcessed += list.length;
      console.log(
        `第 ${pageNum} 页处理完成，累计处理 ${totalProcessed} 条数据`,
      );

      // 如果当前页数据少于页大小，说明已经到最后一页
      if (list.length < pageSize) {
        console.log(`已到达最后一页，停止爬取`);
        break;
      }

      // 延迟请求，避免请求过快被限制
      await new Promise((resolve) => setTimeout(resolve, 1000));

      pageNum++;
    } catch (error) {
      console.error(`获取第 ${pageNum} 页数据失败:`, error.message);
      errorCount++;
      // 连续失败3次则停止
      if (errorCount >= 3) {
        console.error("连续失败多次，停止爬取");
        break;
      }
      pageNum++;
    }
  }

  console.log(
    `爬取完成！总共处理 ${totalProcessed} 条数据，成功 ${successCount} 条，失败 ${errorCount} 条`,
  );
}

// 导出函数供其他模块使用
module.exports = { crawlProducts };

// 如果直接运行此脚本
if (require.main === module) {
  crawlProducts()
    .then(() => {
      console.log("爬取任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("爬取任务执行失败:", error);
      process.exit(1);
    });
}
