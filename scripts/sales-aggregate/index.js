const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);
const cron = require("node-cron");
const db = require("../../config/database");

// 聚合销售报表数据到日报表
async function aggregateSalesReport() {
  console.log("开始聚合销售报表数据...");

  try {
    // 计算一个月前的日期
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().split("T")[0];

    console.log(`聚合日期范围: ${oneMonthAgoStr} 到今天`);

    // 查询需要聚合的数据
    const [salesData] = await db.query(
      `SELECT
        report_date,
        category,
        specification,
        department,
        staff_name,
        SUM(sales_volume) as sales_volume,
        SUM(sales_amount) as sales_amount,
        SUM(shipping_cost) as shipping_cost,
        SUM(platform_subsidy) as platform_subsidy,
        SUM(return_loss) as return_loss
      FROM sales_report
      WHERE report_date >= ?
      GROUP BY report_date, category, specification, department, staff_name`,
      [oneMonthAgoStr]
    );

    if (salesData.length === 0) {
      console.log("没有需要聚合的数据");
      return;
    }

    console.log(`找到 ${salesData.length} 条聚合数据`);

    // 逐条处理，检查是否存在，存在则更新，不存在则插入
    for (const item of salesData) {
      const {
        report_date,
        category,
        specification,
        department,
        staff_name,
        sales_volume,
        sales_amount,
        shipping_cost,
        platform_subsidy,
        return_loss,
      } = item;

      // 检查是否已存在
      const [existing] = await db.query(
        `SELECT id FROM sales_report_daily
         WHERE report_date = ? AND category = ? AND specification = ? AND department = ? AND staff_name = ?
         LIMIT 1`,
        [report_date, category, specification, department, staff_name]
      );

      if (existing.length > 0) {
        // 更新已存在的记录
        await db.query(
          `UPDATE sales_report_daily SET
           sales_volume = ?,
           sales_amount = ?,
           shipping_cost = ?,
           platform_subsidy = ?,
           return_loss = ?,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            sales_volume,
            sales_amount,
            shipping_cost,
            platform_subsidy,
            return_loss,
            existing[0].id,
          ]
        );
      } else {
        // 插入新记录
        await db.query(
          `INSERT INTO sales_report_daily
           (report_date, category, specification, department, staff_name,
            sales_volume, sales_amount, shipping_cost, platform_subsidy, return_loss)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            report_date,
            category,
            specification,
            department,
            staff_name,
            sales_volume,
            sales_amount,
            shipping_cost,
            platform_subsidy,
            return_loss,
          ]
        );
      }
    }

    console.log(`销售报表数据聚合完成，处理了 ${salesData.length} 条数据`);
  } catch (error) {
    console.error("销售报表数据聚合失败:", error);
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 0 * * *", async () => {
  console.log("定时任务触发: 销售报表聚合");
  await aggregateSalesReport();
});

// 手动执行（用于测试）
if (require.main === module) {
  aggregateSalesReport()
    .then(() => {
      console.log("聚合任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("聚合任务执行失败:", error);
      process.exit(1);
    });
}

module.exports = { aggregateSalesReport };
