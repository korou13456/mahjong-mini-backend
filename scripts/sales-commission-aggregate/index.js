require("dotenv").config({
  path: require("path").resolve(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".env.production" : ".env",
  ),
});
const db = require("../../config/database");

// 美元汇率
const USD_RATE = 6.9826;

// 从 priceList 获取工厂原价
const { priceList } = require("../../utils/price-list");

function getFactoryPrice(category, specification) {
  if (!priceList[category]) return 0;
  return priceList[category][specification] || 0;
}

// 产品名称映射到品类
function mapCategory(productName) {
  if (!productName) return null;

  const categoryMap = [
    { keywords: ["T恤"], category: "T恤" },
    { keywords: ["卫衣"], category: "卫衣" },
    { keywords: ["毛毯"], category: "毛毯" },
    { keywords: ["挂毯"], category: "挂毯" },
    { keywords: ["窗帘"], category: "窗帘" },
    { keywords: ["帽子"], category: "帽子" },
    { keywords: ["地垫"], category: "地垫" },
    { keywords: ["鼠标垫"], category: "鼠标垫" },
    { keywords: ["热转印贴"], category: "热转印贴" },
  ];

  for (const map of categoryMap) {
    if (map.keywords.some((kw) => productName.includes(kw))) {
      return map.category;
    }
  }

  return productName;
}

// 步骤1：根据order_id聚合财务表
async function aggregateFinanceByOrder(year, month, staffName = null) {
  const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")} 23:59:59`;

  // 查询有order_id的订单数据
  let query = `SELECT
      order_id,
      transaction_type,
      subtotal,
      shipping,
      total,
      department,
      staff_name,
      finance_time
    FROM finance_transaction_detail
    WHERE finance_time >= ? AND finance_time <= ? AND order_id IS NOT NULL`;
  const params = [startDate, endDate];

  if (staffName) {
    query += ` AND staff_name = ?`;
    params.push(staffName);
  }

  const [financeRows] = await db.query(query, params);

  // 查询广告费用（没有order_id，transaction_type = "Advertising service fee"）
  let adFeeQuery = `SELECT
      transaction_type,
      total,
      department,
      staff_name
    FROM finance_transaction_detail
    WHERE finance_time >= ? AND finance_time <= ? AND order_id IS NULL AND transaction_type = "Advertising service fee"`;
  const adFeeParams = [startDate, endDate];

  if (staffName) {
    adFeeQuery += ` AND staff_name = ?`;
    adFeeParams.push(staffName);
  }

  const [adFeeRows] = await db.query(adFeeQuery, adFeeParams);

  console.log(`查询到 ${adFeeRows.length} 条广告费用记录`);

  // 按order_id聚合
  const financeByOrder = new Map();
  financeRows.forEach((row) => {
    const orderId = row.order_id;
    if (!financeByOrder.has(orderId)) {
      financeByOrder.set(orderId, {
        order_id: orderId,
        user_payment: 0, // Order 用户支付金额
        platform_shipping: 0, // Order Payment和Refund的shipping
        shipping_cost: 0, // Shipping label purchase的total
        refund_subtotal: 0, // Refund的subtotal
        platform_penalty: 0, // 平台罚款
        department: row.department || null,
        staff_name: row.staff_name || null,
        latest_finance_time: row.finance_time,
      });
    }

    const data = financeByOrder.get(orderId);

    // 更新最新财务时间
    if (row.finance_time > data.latest_finance_time) {
      data.latest_finance_time = row.finance_time;
    }

    // 用户支付：Order Payment 的 subtotal
    if (row.transaction_type === "Order Payment") {
      data.user_payment += parseFloat(row.subtotal || 0);
    }

    // 平台物流补贴：Order Payment 和 Refund 的 shipping（Refund 的 shipping 是负值，需要减去）
    if (["Order Payment", "Refund"].includes(row.transaction_type)) {
      data.platform_shipping += parseFloat(row.shipping || 0);
    }

    // 物流费用：Shipping label purchase 和 adjustment 的 total
    if (
      [
        "Shipping label purchase",
        "Shipping label purchase adjustment",
        "Shipping label for return purchase adjustment",
        "Shipping label for return purchase",
        "Shipping label for return purchase covered by plat",
      ].includes(row.transaction_type)
    ) {
      data.shipping_cost += parseFloat(row.total || 0);
    }

    // 退货 subtotal：Refund 的 subtotal
    if (row.transaction_type === "Refund") {
      data.refund_subtotal += parseFloat(row.subtotal || 0);
    }

    // 平台罚款：Delayed fulfillment deduction 和 Out of stock deduction 的 total
    if (
      [
        "Delayed fulfillment deduction",
        "Out of stock deduction",
        "Platform reimbursement",
        "Chargeback processing fee",
      ].includes(row.transaction_type)
    ) {
      data.platform_penalty += parseFloat(row.total || 0);
    }
  });

  console.log(`步骤1：聚合财务数据完成，涉及 ${financeByOrder.size} 个订单`);
  return { financeByOrder, adFeeRows };
}

// 步骤2：使用聚合出来的数据去订单表获取订单发生时间
async function enrichOrderTime(financeByOrder) {
  const orderIds = Array.from(financeByOrder.keys());

  const [orderRows] = await db.query(
    `SELECT
      order_id,
      MIN(purchase_date_china) as earliest_purchase_date
    FROM order_detail
    WHERE order_id IN (?)
    GROUP BY order_id`,
    [orderIds],
  );

  const orderTimeMap = new Map();
  orderRows.forEach((row) => {
    orderTimeMap.set(row.order_id, row.earliest_purchase_date);
  });

  // 补充到财务聚合数据中
  financeByOrder.forEach((data, orderId) => {
    data.purchase_date = orderTimeMap.get(orderId);
  });

  console.log(`步骤2：补充订单时间完成`);
  return financeByOrder;
}

// 步骤3：判断是否有财务回款，有就去供应链表获取成本
async function calculateCost(financeByOrder) {
  if (financeByOrder.size === 0) return financeByOrder;
  console.log(`步骤3：开始筛选有回款的订单...`);

  // 先筛选出所有有回款的订单
  const ordersWithPayment = [];
  financeByOrder.forEach((data, orderId) => {
    // 确保所有数值都有默认值
    data.user_payment = parseFloat(data.user_payment) || 0;
    data.platform_shipping = parseFloat(data.platform_shipping) || 0;
    data.shipping_cost = parseFloat(data.shipping_cost) || 0;
    data.refund_subtotal = parseFloat(data.refund_subtotal) || 0;
    data.platform_penalty = parseFloat(data.platform_penalty) || 0;

    if (data.user_payment > 0) {
      ordersWithPayment.push({ orderId, data });
    }
  });

  if (ordersWithPayment.length === 0) {
    console.log(`步骤3：无回款订单，跳过成本计算`);
    return financeByOrder;
  }

  // 批量查询有回款订单的供应链数据
  const orderIdsWithPayment = ordersWithPayment.map((item) => item.orderId);

  console.log(`步骤3：开始批量查询供应链数据...`);

  const [supplyRows] = await db.query(
    `SELECT
      business_no,
      goods_amount,
      product_name,
      size,
      quantity
     FROM supply_chain_detail
     WHERE business_no IN (?)`,
    [orderIdsWithPayment],
  );

  console.log(`步骤3：查询到 ${supplyRows.length} 条供应链记录`);

  // 按 order_id 分组
  const supplyMap = new Map();
  supplyRows.forEach((row) => {
    const orderId = row.business_no;
    if (!supplyMap.has(orderId)) {
      supplyMap.set(orderId, []);
    }
    supplyMap.get(orderId).push(row);
  });

  // 处理有回款的订单
  let processed = 0;
  const total = ordersWithPayment.length;

  for (const { orderId, data } of ordersWithPayment) {
    processed++;

    if (processed % 1000 === 0) {
      console.log(`步骤3：处理进度 ${processed}/${total}`);
    }

    const supplyRows = supplyMap.get(orderId) || [];
    let totalCost = 0;

    supplyRows.forEach((row) => {
      const goodsAmount = parseFloat(row.goods_amount || 0);

      const usePriceList =
        data.purchase_date &&
        new Date(data.purchase_date) <= new Date("2026-03-04");

      let cost;

      if (usePriceList) {
        const category = mapCategory(row.product_name);
        const specification = row.size;
        const factoryPrice = getFactoryPrice(category, specification);
        cost = factoryPrice * (row.quantity || 1);
      } else {
        cost = goodsAmount;
      }

      totalCost += cost;
    });

    data.total_cost = totalCost;

    // 计算收入（美元）= 用户支付 + 平台物流补贴 + 物流费用 + 退货 subtotal - 平台罚款
    data.total_income_usd =
      data.user_payment +
      data.platform_shipping +
      data.shipping_cost +
      data.refund_subtotal +
      data.platform_penalty;

    // 计算利润（美元）= 收入（美元） - 成本（人民币）/汇率
    data.total_profit_usd = data.total_income_usd - totalCost / USD_RATE;
  }
  // 处理没有回款的订单
  financeByOrder.forEach((data) => {
    if (data.user_payment <= 0 && !data.total_income_usd) {
      data.total_cost = 0;
      // 确保所有数值都有默认值
      data.total_income_usd =
        data.user_payment +
        data.platform_shipping +
        data.shipping_cost +
        data.refund_subtotal +
        data.platform_penalty;

      data.total_profit_usd = data.total_income_usd;
    }
  });

  console.log(`步骤3：成本计算完成`);
  return financeByOrder;
}

// 步骤4：按部门和员工聚合，生成月度报表
async function generateMonthReportData(financeByOrder, adFeeRows) {
  const deptEmpMap = new Map();

  financeByOrder.forEach((data, orderId) => {
    const department = data.department || null;
    const staffName = data.staff_name || null;

    if (!department || !staffName) return;

    const key = `${department}|${staffName}`;
    if (!deptEmpMap.has(key)) {
      deptEmpMap.set(key, {
        department,
        employee: staffName,
        total_income_cny: 0,
        total_profit_cny: 0,
        user_payment: 0,
        platform_shipping: 0,
        shipping_cost: 0,
        refund_subtotal: 0,
        platform_penalty: 0,
        orders: [],
      });
    }

    const empData = deptEmpMap.get(key);

    // 确保数值存在
    const incomeUSD = parseFloat(data.total_income_usd) || 0;
    const profitUSD = parseFloat(data.total_profit_usd) || 0;
    const userPayment = parseFloat(data.user_payment) || 0;
    const platformShipping = parseFloat(data.platform_shipping) || 0;
    const shippingCost = parseFloat(data.shipping_cost) || 0;
    const refundSubtotal = parseFloat(data.refund_subtotal) || 0;
    const platformPenalty = parseFloat(data.platform_penalty) || 0;

    // 累计收入（转为人民币）
    empData.total_income_cny += incomeUSD * USD_RATE;

    // 累计利润（转为人民币）
    empData.total_profit_cny += profitUSD * USD_RATE;

    // 累计各项数据
    empData.user_payment += userPayment;
    empData.platform_shipping += platformShipping;
    empData.shipping_cost += shippingCost;
    empData.refund_subtotal += refundSubtotal;
    empData.platform_penalty += platformPenalty;

    empData.orders.push({
      order_id: orderId,
      user_payment: data.user_payment,
      platform_shipping: data.platform_shipping,
      shipping_cost: data.shipping_cost,
      refund_subtotal: data.refund_subtotal,
      platform_penalty: data.platform_penalty || 0,
      total_income_usd: incomeUSD,
      total_cost_cny: data.total_cost_cny || 0,
      total_profit_usd: profitUSD,
    });
  });

  // 处理广告费用，从总收入中扣除
  adFeeRows.forEach((adRow) => {
    const department = adRow.department;
    const staffName = adRow.staff_name;
    const adFeeUSD = parseFloat(adRow.total) || 0;

    if (!department || !staffName) return;

    const key = `${department}|${staffName}`;
    if (deptEmpMap.has(key)) {
      const empData = deptEmpMap.get(key);
      // 广告费用从总收入中扣除
      empData.total_income_cny += adFeeUSD * USD_RATE;
      empData.total_profit_cny += adFeeUSD * USD_RATE;
      console.log(
        `广告费用: ${department} | ${staffName} | 扣除:$${adFeeUSD.toFixed(2)}`,
      );
    }
  });

  console.log(`步骤4：生成月度报表数据完成，涉及 ${deptEmpMap.size} 个员工`);

  return Array.from(deptEmpMap.values());
}

// 生成并保存月度报表
async function generateMonthReport(year, month, staffName = null) {
  const monthStr = `${year}-${month.toString().padStart(2, "0")}`;

  console.log(
    `开始生成 ${monthStr} 月度报表${staffName ? `（员工：${staffName}）` : ""}...`,
  );

  // 步骤1：根据order_id聚合财务表
  const { financeByOrder, adFeeRows } = await aggregateFinanceByOrder(
    year,
    month,
    staffName,
  );

  // 步骤2：使用聚合出来的数据去订单表获取订单发生时间
  const enrichOrderTimeData = await enrichOrderTime(financeByOrder);
  // 步骤3：判断是否有财务回款，有就去供应链表获取成本
  const calculateCostData = await calculateCost(enrichOrderTimeData);
  // 步骤4：按部门和员工聚合，生成月度报表
  const monthReportData = await generateMonthReportData(
    calculateCostData,
    adFeeRows,
  );

  if (monthReportData.length === 0) {
    console.log("无数据");
    return [];
  }

  // 计算部门维度聚合
  const deptMap = {};
  monthReportData.forEach((emp) => {
    if (!deptMap[emp.department]) {
      deptMap[emp.department] = { total_profit_cny: 0, employees: [] };
    }
    deptMap[emp.department].total_profit_cny += emp.total_profit_cny;
    deptMap[emp.department].employees.push(emp);
  });

  // 构建插入数据
  const insertData = [];
  Object.values(deptMap).forEach((dept) => {
    const teamProfitCNY = parseFloat(dept.total_profit_cny) || 0;

    dept.employees.forEach((emp) => {
      const totalIncome = parseFloat(emp.total_income_cny) || 0;
      const totalProfit = parseFloat(emp.total_profit_cny) || 0;

      insertData.push([
        monthStr,
        emp.department,
        emp.employee,
        totalIncome.toFixed(2),
        totalProfit.toFixed(2),
        teamProfitCNY.toFixed(2),
        0.0, // personal_commission
        0.0, // team_commission
      ]);

      console.log(
        `${monthStr} | ${emp.department} | ${emp.employee} | 总收入:¥${totalIncome.toFixed(2)} | 利润:¥${totalProfit.toFixed(2)}`,
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
  const staffName = args[2] || null;

  generateMonthReport(year, month, staffName)
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
