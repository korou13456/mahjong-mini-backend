require("dotenv").config({
  path: require("path").resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});
const db = require("../../config/database");

// 出厂价（人民币）
const FACTORY_PRICES = {
  T恤: 18,
  卫衣: 35,
  毛毯: { "30*40": 20, "40*50": 30, "50*60": 40, "60*80": 50 },
  挂毯: { "30*40": 20, "40*60": 35, "50*60": 40, "60*80": 50, "60*90": 50 },
  窗帘: { "52*63": 50, "52*84": 50 },
  帽子: { 牛仔帽: 18, 三明治帽: 18 },
  地垫: { "40*60": 25, "43*75": 30, "43*120": 35 },
  鼠标垫: { "30*80": 20, "80*30": 20 },
  热转印贴: 7,
};

// 美元汇率
const USD_RATE = 6.9826;

// 获取出厂价
function getFactoryPrice(category, specification) {
  const categoryPrice = FACTORY_PRICES[category];
  if (typeof categoryPrice === "number") return categoryPrice;
  if (typeof categoryPrice === "object" && categoryPrice[specification])
    return categoryPrice[specification];
  return 0;
}

// 获取当月销售数据并聚合
async function getMonthlySalesData(year, month) {
  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`;

  const [rows] = await db.query(
    `SELECT 
      department, staff_name, category, specification,
      SUM(sales_volume) AS total_volume,
      SUM(sales_amount) AS total_sales_amount,
      SUM(shipping_cost) AS total_shipping_cost,
      SUM(platform_subsidy) AS total_platform_subsidy,
      SUM(return_loss) AS total_return_loss
    FROM sales_report_daily
    WHERE report_date >= ? AND report_date <= ?
    GROUP BY department, staff_name, category, specification`,
    [startDate, endDate],
  );

  return rows;
}

// 聚合员工当月总收入和利润（美元）
function aggregateEmployee(rows) {
  const agg = {};

  rows.forEach((row) => {
    const key = `${row.department}|${row.staff_name}`;
    if (!agg[key]) {
      agg[key] = {
        department: row.department,
        employee: row.staff_name,
        total_income: 0, // 美元收入
        total_profit: 0,
      };
    }

    const item = agg[key];

    // 总收入 = 销售额 + 运费 + 平台补贴 + 退货损耗 (USD)
    const totalIncomeUSD =
      parseFloat(row.total_sales_amount) +
      parseFloat(row.total_shipping_cost) +
      parseFloat(row.total_platform_subsidy) +
      parseFloat(row.total_return_loss);

    // 利润 = 总收入美元 - 数量 * 出厂价(转美元)
    const factoryPriceCNY = getFactoryPrice(row.category, row.specification);
    const factoryPriceUSD = factoryPriceCNY / USD_RATE;
    const costUSD = row.total_volume * factoryPriceUSD;
    const profitUSD = totalIncomeUSD - costUSD;

    console.log(`  ${row.category} ${row.specification} | 数量:${row.total_volume} | 销售额:$${row.total_sales_amount} | 运费:$${row.total_shipping_cost} | 补贴:$${row.total_platform_subsidy} | 退货损耗:$${row.total_return_loss} | 出厂价(¥${factoryPriceCNY}/$${factoryPriceUSD.toFixed(2)}) | 成本:$${costUSD.toFixed(2)} | 利润:$${profitUSD.toFixed(2)}`);

    item.total_income += totalIncomeUSD;
    item.total_profit += profitUSD;
  });

  return Object.values(agg);
}

// 美元转人民币
function usdToCNY(usd) {
  return usd * USD_RATE;
}

// 计算个人提成比例（部门总利润人民币）
function getPersonalRate(teamProfit) {
  if (teamProfit < 50000) return 0;
  if (teamProfit < 300000) return 0.01;
  if (teamProfit < 500000) return 0.04;
  if (teamProfit < 1000000) return 0.08;
  if (teamProfit < 2500000) return 0.12;
  return 0.15;
}

// 生成并保存月度报表
async function generateMonthReport(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, "0")}`;

  const salesData = await getMonthlySalesData(year, month);
  if (!salesData.length) return console.log("无销售数据");

  const employeeAgg = aggregateEmployee(salesData);

  // 部门聚合
  const deptMap = {};
  employeeAgg.forEach((emp) => {
    if (!deptMap[emp.department])
      deptMap[emp.department] = { total_profit: 0, employees: [] };
    deptMap[emp.department].total_profit += emp.total_profit;
    deptMap[emp.department].employees.push(emp);
  });

  const insertData = [];
  Object.values(deptMap).forEach((dept) => {
    const teamProfit = dept.total_profit;
    const teamProfitCNY = usdToCNY(teamProfit);
    const personalRate = getPersonalRate(teamProfitCNY);
    const teamBonusPool = teamProfitCNY >= 50000 ? teamProfitCNY * 0.04 : 0;
    const perPersonTeamBonus = teamBonusPool / dept.employees.length;

    dept.employees.forEach((emp) => {
      const personalCommissionUSD = emp.total_profit * personalRate;
      const personalCommissionCNY = usdToCNY(personalCommissionUSD);
      const totalIncomeCNY = usdToCNY(emp.total_income);
      const totalProfitCNY = usdToCNY(emp.total_profit);

      insertData.push([
        monthStr,
        emp.department,
        emp.employee,
        totalIncomeCNY.toFixed(2),
        totalProfitCNY.toFixed(2),
        teamProfitCNY.toFixed(2),
        personalCommissionCNY.toFixed(2),
        perPersonTeamBonus.toFixed(2),
      ]);

      console.log(
        `${monthStr} | ${emp.department} | ${emp.employee} | 总收入:$${emp.total_income.toFixed(2)}(¥${totalIncomeCNY.toFixed(2)}) | 利润:$${emp.total_profit.toFixed(2)}(¥${totalProfitCNY.toFixed(2)}) | 个人提成:¥${personalCommissionCNY.toFixed(2)} | 团队奖励:¥${perPersonTeamBonus.toFixed(2)}`
      );
    });
  });

  // 写入数据库
  const [result] = await db.query(
    `INSERT INTO month_report
      (month, department, employee, total_income, total_profit, team_total_profit, personal_commission, team_commission)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       total_income = VALUES(total_income),
       total_profit = VALUES(total_profit),
       team_total_profit = VALUES(team_total_profit),
       personal_commission = VALUES(personal_commission),
       team_commission = VALUES(team_commission)`,
    [insertData],
  );

  console.log(`保存 ${result.affectedRows} 条月度报表`);
  return insertData;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const year = parseInt(args[0]) || new Date().getFullYear();
  const month = parseInt(args[1]) || new Date().getMonth() + 1;

  generateMonthReport(year, month)
    .then(() => {
      console.log("月度报表生成完成");
      process.exit(0);
    })
    .catch((err) => {
      console.error("生成失败", err);
      process.exit(1);
    });
}

module.exports = { generateMonthReport };
