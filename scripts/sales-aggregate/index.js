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
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 3);
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
        SUM(platform_penalty) as platform_penalty,
        SUM(return_loss) as return_loss,
        SUM(resend_loss) as resend_loss
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

    // 批量删除旧数据（基于聚合维度）
    const deleteConditions = salesData.map(item =>
      `(${db.escape(item.report_date)}, ${db.escape(item.category)}, ${db.escape(item.specification)}, ${db.escape(item.department)}, ${db.escape(item.staff_name)})`
    ).join(', ');

    await db.query(
      `DELETE FROM sales_report_daily
       WHERE (report_date, category, specification, department, staff_name) IN (${deleteConditions})`
    );

    // 批量插入新数据
    const batchSize = 500;
    for (let i = 0; i < salesData.length; i += batchSize) {
      const batch = salesData.slice(i, i + batchSize);
      const values = batch.flatMap(item => [
        item.report_date,
        item.category,
        item.specification,
        item.department,
        item.staff_name,
        item.sales_volume,
        item.sales_amount,
        item.shipping_cost,
        item.platform_subsidy,
        item.platform_penalty,
        item.return_loss,
        item.resend_loss,
      ]);

      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      await db.query(
        `INSERT INTO sales_report_daily
         (report_date, category, specification, department, staff_name,
          sales_volume, sales_amount, shipping_cost, platform_subsidy, platform_penalty, return_loss, resend_loss)
         VALUES ${placeholders}`,
        values
      );

      console.log(`已处理 ${Math.min(i + batchSize, salesData.length)}/${salesData.length} 条数据`);
    }

    console.log(`销售报表数据聚合完成，处理了 ${salesData.length} 条数据`);
  } catch (error) {
    console.error("销售报表数据聚合失败:", error);
    throw error; // 抛出错误让PM2知道
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 0 * * *", async () => {
  console.log("定时任务触发: 销售报表聚合");
  await aggregateSalesReport();
});

// PM2 启动时保持进程运行
if (require.main === module) {
  // 检查是否是 PM2 运行环境
  const isPM2 = process.env.pm_id !== undefined;

  if (isPM2) {
    // PM2 环境：设置就绪信号并保持运行，等待定时触发
    if (process.send) {
      process.send('ready');
    }
    console.log("销售报表聚合任务已启动（PM2模式），等待定时触发...");
  } else {
    // 本地直接运行：立即执行一次
    console.log("销售报表聚合任务（本地模式），立即执行...");
    aggregateSalesReport()
      .then(() => {
        console.log("聚合任务执行完毕");
        process.exit(0);
      })
      .catch((error) => {
        console.error("聚合任务执行失败:", error);
        process.exit(1);
      });
    return; // 提前返回，不执行下面的信号监听
  }

  // 保持进程运行，不让进程退出
  // node-cron 定时任务会持续运行
  process.on('SIGINT', () => {
    console.log('\n收到退出信号，正在关闭...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n收到终止信号，正在关闭...');
    process.exit(0);
  });
}

module.exports = { aggregateSalesReport };
