const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);
const cron = require("node-cron");
const db = require("../../config/database");

// 聚合订单商品数据
async function aggregateOrderProduct() {
  console.log("开始聚合订单商品数据...");

  try {
    // 计算一个月前的日期
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().split("T")[0];

    console.log(`聚合日期范围: ${oneMonthAgoStr} 到今天`);

    // 查询需要聚合的数据（按照中国日期 purchase_date_china）
    const [orderData] = await db.query(
      `SELECT
        DATE(purchase_date_china) as data_time,
        category,
        variation,
        department,
        staff_name,
        SUM(quantity) as quantity,
        SUM(price) as price
      FROM order_product_record
      WHERE purchase_date_china >= ? AND status = 1
      GROUP BY DATE(purchase_date_china), category, variation, department, staff_name`,
      [oneMonthAgoStr]
    );

    if (orderData.length === 0) {
      console.log("没有需要聚合的数据");
      return;
    }

    console.log(`找到 ${orderData.length} 条聚合数据`);

    // 逐条处理，检查是否存在，存在则更新，不存在则插入
    for (const item of orderData) {
      const {
        data_time,
        category,
        variation,
        department,
        staff_name,
        quantity,
        price,
      } = item;

      // 检查是否已存在
      const [existing] = await db.query(
        `SELECT id FROM order_product_aggregate
         WHERE data_time = ? AND category = ? AND variation = ? AND department = ? AND staff_name = ?
         LIMIT 1`,
        [data_time, category, variation, department, staff_name]
      );

      if (existing.length > 0) {
        // 更新已存在的记录
        await db.query(
          `UPDATE order_product_aggregate SET
           quantity = ?,
           price = ?,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [quantity, price, existing[0].id]
        );
      } else {
        // 插入新记录
        await db.query(
          `INSERT INTO order_product_aggregate
           (data_time, category, variation, department, staff_name, quantity, price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [data_time, category, variation, department, staff_name, quantity, price]
        );
      }
    }

    console.log(`订单商品数据聚合完成，处理了 ${orderData.length} 条数据`);
  } catch (error) {
    console.error("订单商品数据聚合失败:", error);
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 0 * * *", async () => {
  console.log("定时任务触发: 订单商品聚合");
  await aggregateOrderProduct();
});

// 手动执行（用于测试）
if (require.main === module) {
  aggregateOrderProduct()
    .then(() => {
      console.log("聚合任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("聚合任务执行失败:", error);
      process.exit(1);
    });
}

module.exports = { aggregateOrderProduct };
