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
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 3);
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
        SUM(price * quantity) as price
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

    // 批量删除旧数据
    await db.query(`DELETE FROM order_product_aggregate WHERE data_time >= ?`, [
      oneMonthAgoStr,
    ]);

    // 批量插入新数据
    const batchSize = 500;
    for (let i = 0; i < orderData.length; i += batchSize) {
      const batch = orderData.slice(i, i + batchSize);
      const values = batch.flatMap((item) => [
        item.data_time,
        item.category,
        item.variation,
        item.department,
        item.staff_name,
        item.quantity,
        item.price,
      ]);

      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");

      await db.query(
        `INSERT INTO order_product_aggregate
         (data_time, category, variation, department, staff_name, quantity, price)
         VALUES ${placeholders}`,
        values
      );

      console.log(
        `已处理 ${Math.min(i + batchSize, orderData.length)}/${
          orderData.length
        } 条数据`
      );
    }

    console.log(`订单商品数据聚合完成，处理了 ${orderData.length} 条数据`);
  } catch (error) {
    console.error("订单商品数据聚合失败:", error);
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 19 * * *", async () => {
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
