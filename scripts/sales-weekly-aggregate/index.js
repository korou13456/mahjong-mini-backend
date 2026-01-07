const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);
const cron = require("node-cron");
const db = require("../../config/database");

// 获取指定日期所在周的周日到下周一（周日为一周的第一天）
function getWeekStartEnd(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 是周日，1-6 是周一到周六
  const diff = day === 0 ? 0 : -day; // 周日为0，其他往前推 day 天到周日
  d.setDate(d.getDate() + diff);
  const weekStart = new Date(d);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(d);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // 格式化为 YYYY-MM-DD，避免时区问题
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return {
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
  };
}

// 聚合销售报表数据到周报表
async function aggregateSalesReport() {
  console.log("开始聚合销售周报表数据...");

  try {
    // 计算一个月前的日期
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoStr = oneMonthAgo.toISOString().split("T")[0];

    console.log(`聚合日期范围: ${oneMonthAgoStr} 到今天`);

    // 查询需要聚合的数据（按周分组）
    const [salesData] = await db.query(
      `SELECT
        DATE(report_date) as report_date,
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
      GROUP BY DATE(report_date), category, specification, department, staff_name
      ORDER BY DATE(report_date) ASC`,
      [oneMonthAgoStr]
    );

    if (salesData.length === 0) {
      console.log("没有需要聚合的数据");
      return;
    }

    console.log(`找到 ${salesData.length} 条原始数据`);

    // 按周、品类、规格、部门、人员分组聚合
    const weeklyData = new Map();

    salesData.forEach((item) => {
      const { weekStart, weekEnd } = getWeekStartEnd(item.report_date);
      const key = `${weekStart}|${weekEnd}|${item.category}|${item.specification}|${item.department}|${item.staff_name}`;

      if (!weeklyData.has(key)) {
        weeklyData.set(key, {
          week_start_date: weekStart,
          week_end_date: weekEnd,
          category: item.category,
          specification: item.specification,
          department: item.department,
          staff_name: item.staff_name,
          sales_volume: 0,
          sales_amount: 0,
          shipping_cost: 0,
          platform_subsidy: 0,
          return_loss: 0,
          resend_loss: 0,
        });
      }

      const data = weeklyData.get(key);
      data.sales_volume += parseFloat(item.sales_volume) || 0;
      data.sales_amount += parseFloat(item.sales_amount) || 0;
      data.shipping_cost += parseFloat(item.shipping_cost) || 0;
      data.platform_subsidy += parseFloat(item.platform_subsidy) || 0;
      data.return_loss += parseFloat(item.return_loss) || 0;
      // resend_loss 在 sales_report 表中不存在，默认为0
    });

    console.log(`聚合为 ${weeklyData.size} 条周数据`);

    // 调试：打印聚合后的数据
    for (const [key, item] of weeklyData) {
      if (
        item.week_start_date === "2025-12-28" &&
        item.specification === "XXL"
      ) {
        console.log(`调试数据:`, key, item);
      }
    }

    // 逐条处理，检查是否存在，存在则更新，不存在则插入
    let updateCount = 0;
    let insertCount = 0;

    for (const [key, item] of weeklyData) {
      const {
        week_start_date,
        week_end_date,
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
        `SELECT id FROM sales_report_weekly
         WHERE week_start_date = ? AND week_end_date = ? AND category = ? AND specification = ? AND department = ? AND staff_name = ?
         LIMIT 1`,
        [
          week_start_date,
          week_end_date,
          category,
          specification,
          department,
          staff_name,
        ]
      );

      if (existing.length > 0) {
        // 更新已存在的记录
        await db.query(
          `UPDATE sales_report_weekly SET
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
        updateCount++;
      } else {
        // 插入新记录
        await db.query(
          `INSERT INTO sales_report_weekly
           (week_start_date, week_end_date, category, specification, department, staff_name,
            sales_volume, sales_amount, shipping_cost, platform_subsidy, return_loss)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            week_start_date,
            week_end_date,
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
        insertCount++;
      }
    }

    console.log(
      `销售周报表数据聚合完成，更新 ${updateCount} 条，新增 ${insertCount} 条`
    );
  } catch (error) {
    console.error("销售周报表数据聚合失败:", error);
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 0 * * *", async () => {
  console.log("定时任务触发: 销售周报表聚合");
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
