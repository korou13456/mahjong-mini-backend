const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);

const db = require("../../config/database");

// 美元汇率
const USD_TO_CNY_RATE = 6.9826;
// const USD_TO_CNY_RATE = 1;

// 交易类型配置
const { TRANSACTION_TYPES } = require("../../utils/transaction-types");

// 工厂价格配置
const { priceList } = require("../../utils/price-list");

// 步骤1: 查询并聚合财务表数据
async function aggregateFinanceData(
  monthStart,
  monthEnd,
  targetEmployee = null,
) {
  let query = `
    SELECT
      order_id,
      order_item_id,
      transaction_type,
      subtotal,
      shipping,
      total,
      department,
      staff_name,
      finance_time
    FROM finance_transaction_detail
    WHERE finance_time >= ? AND finance_time < ?
      AND order_id IS NOT NULL
  `;
  const params = [monthStart, monthEnd];

  if (targetEmployee) {
    query += ` AND staff_name = ?`;
    params.push(targetEmployee);
  }

  const [financeRows] = await db.query(query, params);
  console.log(`查询到 ${financeRows.length} 条财务数据`);

  // 按照 order_id 聚合财务数据
  const financeByOrder = new Map();

  financeRows.forEach((row) => {
    if (!financeByOrder.has(row.order_id)) {
      financeByOrder.set(row.order_id, {
        order_id: row.order_id,
        department: row.department,
        staff_name: row.staff_name,
        user_payment: 0, // 用户支付 .subtotal
        platform_shipping: 0, // 平台物流补贴 .shipping
        shipping_cost: 0, // 物流费用 .total
        shipping_cost_adjustment: 0, // 物流调整费用 .total
        return_loss: 0, // 退货损耗（退货金额 + 退货物流费用）
        platform_penalty: 0, // 平台罚款 .total
      });
    }

    const data = financeByOrder.get(row.order_id);

    // 用户支付
    if (TRANSACTION_TYPES.USER_PAYMENT.includes(row.transaction_type)) {
      data.user_payment += parseFloat(row.subtotal || 0) * USD_TO_CNY_RATE;
    }

    // 平台物流补贴
    if (TRANSACTION_TYPES.PLATFORM_SHIPPING.includes(row.transaction_type)) {
      data.platform_shipping += parseFloat(row.shipping || 0) * USD_TO_CNY_RATE;
    }

    // 物流费用
    if (TRANSACTION_TYPES.SHIPPING_COST.includes(row.transaction_type)) {
      data.shipping_cost += parseFloat(row.total || 0) * USD_TO_CNY_RATE;
    }

    // 物流调整费用
    if (
      TRANSACTION_TYPES.SHIPPING_COST_ADJUSTMENT.includes(row.transaction_type)
    ) {
      data.shipping_cost_adjustment +=
        parseFloat(row.total || 0) * USD_TO_CNY_RATE;
    }

    // 退货金额
    if (TRANSACTION_TYPES.REFUND.includes(row.transaction_type)) {
      data.return_loss += parseFloat(row.subtotal || 0) * USD_TO_CNY_RATE;
    }

    // 退货产生的物流费用（计入退货损耗）
    if (TRANSACTION_TYPES.SHIPPING_COST_RETURN.includes(row.transaction_type)) {
      data.return_loss += parseFloat(row.total || 0) * USD_TO_CNY_RATE;
    }

    // 平台罚款
    if (TRANSACTION_TYPES.PLATFORM_PENALTY.includes(row.transaction_type)) {
      data.platform_penalty += parseFloat(row.total || 0) * USD_TO_CNY_RATE;
    }
  });

  console.log(`聚合完成，共 ${financeByOrder.size} 个订单`);
  return financeByOrder;
}

// 步骤2: 查询 user_payment > 0 的订单，并聚合其历史 Shipping label purchase 费用
async function aggregateHistoricalShippingCost(financeByOrder, monthStart) {
  // 筛选出 user_payment > 0 的订单
  const orderIds = [];
  financeByOrder.forEach((data) => {
    if (data.user_payment > 0) {
      orderIds.push(data.order_id);
    }
  });

  console.log(`user_payment > 0 的订单数: ${orderIds.length}`);

  if (orderIds.length === 0) {
    return new Map();
  }

  // 查询这些订单在 monthEnd 之前的所有 Shipping label purchase 费用
  const query = `
    SELECT
      order_id,
      total
    FROM finance_transaction_detail
    WHERE order_id IN (?)
      AND transaction_type = ?
      AND finance_time < ?
  `;

  const [shippingRows] = await db.query(query, [
    orderIds,
    TRANSACTION_TYPES.SHIPPING_COST[0],
    monthStart,
  ]);
  console.log(`查询到 ${shippingRows.length} 条历史物流费用记录`);

  // 按 order_id 聚合历史物流费用
  const historicalShippingCost = new Map();
  shippingRows.forEach((row) => {
    if (!historicalShippingCost.has(row.order_id)) {
      historicalShippingCost.set(row.order_id, 0);
    }
    historicalShippingCost.set(
      row.order_id,
      historicalShippingCost.get(row.order_id) +
        parseFloat(row.total || 0) * USD_TO_CNY_RATE,
    );
  });

  console.log(
    `历史物流费用聚合完成，涉及 ${historicalShippingCost.size} 个订单`,
  );
  return historicalShippingCost;
}

// 步骤3: 分组过滤数据
function filterInvalidOrders(financeByOrder) {
  const userPaymentOrders = new Map(); // user_payment != 0 的订单
  const otherOrders = new Map(); // user_payment == 0 但不只有 shipping_cost != 0 的订单

  financeByOrder.forEach((data, orderId) => {
    // user_payment 不等于 0 的放第一组
    if (data.user_payment !== 0) {
      userPaymentOrders.set(orderId, data);
    } else {
      // user_payment 等于 0，但不只有 shipping_cost 不等于 0 的放第二组
      const hasOtherValue =
        data.platform_shipping !== 0 ||
        data.shipping_cost_adjustment !== 0 ||
        data.return_loss !== 0 ||
        data.platform_penalty !== 0;

      if (hasOtherValue) {
        otherOrders.set(orderId, data);
      }
    }
  });

  return {
    userPaymentOrders,
    otherOrders,
  };
}

// 步骤4: 处理 otherOrders 的数据，计算每个员工的平台收入总和
async function processOtherOrders(
  otherOrders,
  monthStart,
  monthEnd,
  targetEmployee = null,
) {
  const employeePenaltyMap = new Map();

  // 处理 otherOrders 中的数据
  otherOrders.forEach((data) => {
    const key = `${data.department}_${data.staff_name}`;
    if (!employeePenaltyMap.has(key)) {
      employeePenaltyMap.set(key, {
        department: data.department,
        staff_name: data.staff_name,
        penalty: 0,
      });
    }

    const employeeData = employeePenaltyMap.get(key);
    employeeData.penalty +=
      data.platform_shipping +
      data.shipping_cost_adjustment +
      data.return_loss +
      data.platform_penalty;
  });


  // 查询对应时间内所有的广告费用
  let query = `
    SELECT
      department,
      staff_name,
      total
    FROM finance_transaction_detail
    WHERE finance_time >= ? AND finance_time < ?
      AND transaction_type = ?
  `;
  const params = [monthStart, monthEnd, TRANSACTION_TYPES.ADVERTISING_FEE];

  if (targetEmployee) {
    query += ` AND staff_name = ?`;
    params.push(targetEmployee);
  }

  const [advertisingRows] = await db.query(query, params);
  console.log(`查询到 ${advertisingRows.length} 条广告费用记录`);

  // 根据 staff_name 聚合广告费用
  advertisingRows.forEach((row) => {
    const key = `${row.department}_${row.staff_name}`;
    if (!employeePenaltyMap.has(key)) {
      employeePenaltyMap.set(key, {
        department: row.department,
        staff_name: row.staff_name,
        penalty: 0,
      });
    }

    const employeeData = employeePenaltyMap.get(key);
    employeeData.penalty += parseFloat(row.total || 0) * USD_TO_CNY_RATE;
  });

  console.log(
    `otherOrders 员工罚款聚合完成（含广告费用），共 ${employeePenaltyMap.size} 个员工`,
  );
  return employeePenaltyMap;
}

// 步骤5: 处理 userPaymentOrders 的数据，查询订单表获取订单发生时间
async function processUserPaymentOrders(userPaymentOrders) {
  if (userPaymentOrders.size === 0) {
    console.log("userPaymentOrders 为空，跳过查询订单时间");
    return userPaymentOrders;
  }

  const orderIds = Array.from(userPaymentOrders.keys());

  // 查询订单发生时间
  const query = `
    SELECT
      order_id,
      purchase_date_china
    FROM order_detail
    WHERE order_id IN (?)
  `;

  const [orderRows] = await db.query(query, [orderIds]);
  console.log(`查询到 ${orderRows.length} 个订单的发生时间`);

  // 将订单时间拼接到对应的数据中，并转换为 2026-03-04 00:00:00 格式
  const orderTimeMap = new Map();
  orderRows.forEach((row) => {
    let formattedDate = null;
    try {
      // 将 row.purchase_date_china 转换为字符串
      let dateStr = row.purchase_date_china;
      if (row.purchase_date_china instanceof Date) {
        // 如果是 Date 对象，先转换为 ISO 字符串
        dateStr = row.purchase_date_china.toISOString();
      } else if (typeof row.purchase_date_china !== "string") {
        // 如果不是字符串，转换为字符串
        dateStr = String(row.purchase_date_china);
      }

      if (dateStr && dateStr.includes("T")) {
        // ISO格式时间转换
        const isoDate = new Date(dateStr);
        const year = isoDate.getFullYear();
        const month = String(isoDate.getMonth() + 1).padStart(2, "0");
        const day = String(isoDate.getDate()).padStart(2, "0");
        const hours = String(isoDate.getHours()).padStart(2, "0");
        const minutes = String(isoDate.getMinutes()).padStart(2, "0");
        const seconds = String(isoDate.getSeconds()).padStart(2, "0");
        formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      } else {
        // 如果已经是 2026-03-04 00:00:00 格式，直接使用
        formattedDate = dateStr;
      }
    } catch (error) {
      console.error(`解析订单时间失败: ${row.purchase_date_china}`, error);
      formattedDate = row.purchase_date_china;
    }
    orderTimeMap.set(row.order_id, formattedDate);
  });

  // 将 purchase_date_china 添加到 userPaymentOrders 的数据中
  userPaymentOrders.forEach((data, orderId) => {
    data.purchase_date_china = orderTimeMap.get(orderId) || null;
  });

  return userPaymentOrders;
}

// 产品名称映射函数
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

// 步骤6: 查询供应链表，获取尺寸名称、价格和数量
async function processSupplyChainData(enrichedUserPaymentOrders) {
  if (enrichedUserPaymentOrders.size === 0) {
    console.log("enrichedUserPaymentOrders 为空，跳过查询供应链数据");
    return enrichedUserPaymentOrders;
  }

  const orderIds = Array.from(enrichedUserPaymentOrders.keys());

  // 查询供应链数据
  const query = `
    SELECT
      business_no as order_id,
      product_name,
      size,
      goods_amount as price,
      quantity
    FROM supply_chain_detail
    WHERE business_no IN (?)
  `;

  const [supplyChainRows] = await db.query(query, [orderIds]);
  console.log(`查询到 ${supplyChainRows.length} 条供应链记录`);

  // 按 order_id 聚合供应链数据
  const supplyChainByOrder = new Map();
  supplyChainRows.forEach((row) => {
    if (!supplyChainByOrder.has(row.order_id)) {
      supplyChainByOrder.set(row.order_id, []);
    }
    supplyChainByOrder.get(row.order_id).push({
      product_name: mapCategory(row.product_name),
      size: row.size,
      price: parseFloat(row.price || 0),
      quantity: row.quantity,
    });
  });

  // 将供应链数据添加到 enrichedUserPaymentOrders
  const cutoffDate = new Date("2026-03-04 23:59:59");

  enrichedUserPaymentOrders.forEach((data, orderId) => {
    const supplyChainItems = supplyChainByOrder.get(orderId) || [];
    if (supplyChainItems.length > 0) {
      // 判断是否在 2026-03-04 之前（包括当天）
      // purchase_date_china 已经在第五步处理为 2026-03-04 00:00:00 格式
      const orderDate = data.purchase_date_china
        ? new Date(data.purchase_date_china)
        : null;

      // 计算所有商品的总成本
      let totalPrice = 0;
      let totalQuantity = 0;

      supplyChainItems.forEach((item) => {
        totalQuantity += item.quantity;

        if (orderDate && orderDate <= cutoffDate) {
          // 使用 priceList 价格
          if (
            priceList[item.product_name] &&
            priceList[item.product_name][item.size]
          ) {
            // priceList 价格需要乘以数量
            totalPrice +=
              priceList[item.product_name][item.size] * item.quantity;
          } else {
            totalPrice += item.price;
          }
        } else {
          // 使用供应链表价格
          totalPrice += item.price;
        }
      });

      data.product_name = supplyChainItems
        .map((item) => item.product_name)
        .join(", ");
      data.size = supplyChainItems.map((item) => item.size).join(", ");
      data.quantity = totalQuantity;
      data.price = totalPrice;
    } else {
      // 没有找到供应链数据，设置默认值
      data.product_name = null;
      data.size = null;
      data.quantity = 0;
      data.price = 0;
      console.warn(`订单 ${orderId} 未找到供应链数据`);
    }
  });

  return enrichedUserPaymentOrders;
}

// 步骤7: 计算收入和利润
function calculateProfit(finalUserPaymentOrders) {
  finalUserPaymentOrders.forEach((data, orderId) => {
    // 收入 = user_payment + platform_shipping + shipping_cost + shipping_cost_adjustment + return_loss + platform_penalty
    data.revenue =
      data.user_payment +
      data.platform_shipping +
      data.shipping_cost +
      data.shipping_cost_adjustment +
      data.return_loss +
      data.platform_penalty;

    // 利润 = 收入 - price（确保 price 是数字）
    const price = parseFloat(data.price) || 0;
    data.profit = data.revenue - price;
  });

  console.log(`计算完成 ${finalUserPaymentOrders.size} 个订单的收入和利润`);
  return finalUserPaymentOrders;
}

// 步骤8: 按 department 和 staff_name 聚合并插入数据库
async function insertEmployeeProfitData(
  targetMonth,
  finalUserPaymentOrders,
  employeePenaltyMap,
) {
  // 按 department 和 staff_name 聚合数据
  const employeeProfitMap = new Map();
  const departmentProfitMap = new Map();

  finalUserPaymentOrders.forEach((data) => {
    const key = `${data.department}_${data.staff_name}`;
    if (!employeeProfitMap.has(key)) {
      employeeProfitMap.set(key, {
        department: data.department,
        employee: data.staff_name,
        total_income: 0,
        total_profit: 0,
      });
    }

    const employeeData = employeeProfitMap.get(key);
    employeeData.total_income += data.revenue;
    employeeData.total_profit += data.profit;

    // 聚合部门总利润
    if (!departmentProfitMap.has(data.department)) {
      departmentProfitMap.set(data.department, 0);
    }
    departmentProfitMap.set(
      data.department,
      departmentProfitMap.get(data.department) + data.profit,
    );
  });

  console.log(`聚合完成，共 ${employeeProfitMap.size} 个员工的数据`);

  // 插入或更新数据库
  for (const [key, data] of employeeProfitMap) {
    const teamTotalProfit = departmentProfitMap.get(data.department) || 0;

    // 获取该员工的罚款，只减去自己的罚款
    const employeePenalty = employeePenaltyMap.get(key);
    const penalty = employeePenalty ? employeePenalty.penalty : 0;

    // 总收入和总利润都要减去该员工的罚款
    const finalTotalIncome = data.total_income + penalty;
    const finalTotalProfit = data.total_profit + penalty;

    const query = `
      INSERT INTO employee_profit (
        month,
        department,
        employee,
        total_income,
        total_profit,
        team_total_profit
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_income = VALUES(total_income),
        total_profit = VALUES(total_profit),
        team_total_profit = VALUES(team_total_profit),
        updated_at = CURRENT_TIMESTAMP
    `;

    try {
      await db.query(query, [
        targetMonth,
        data.department,
        data.employee,
        finalTotalIncome,
        finalTotalProfit,
        teamTotalProfit,
      ]);
    } catch (error) {
      console.error(
        `插入员工数据失败: ${data.department} - ${data.employee}`,
        error,
      );
    }
  }

  console.log("员工利润数据插入完成");
}

// 聚合员工利润数据
async function aggregateEmployeeProfit(targetMonth, targetEmployee = null) {
  console.log(`开始聚合 ${targetMonth} 员工利润数据...`);

  try {
    // 计算月份的开始和结束时间
    const [yearStr, monthStr] = targetMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
    const monthEnd = new Date(year, month, 1, 0, 0, 0);

    // 格式化为本地时间字符串
    const formatLocalDate = (date) => {
      const pad = (n) => n.toString().padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    console.log(
      `查询范围: ${formatLocalDate(monthStart)} 至 ${formatLocalDate(monthEnd)}`,
    );
    if (targetEmployee) {
      console.log(`筛选员工: ${targetEmployee}`);
    }

    // 1. 查询并聚合财务表数据
    const financeByOrder = await aggregateFinanceData(
      monthStart,
      monthEnd,
      targetEmployee,
    );

    // 2. 查询并聚合历史 Shipping label purchase 费用
    const historicalShippingCost = await aggregateHistoricalShippingCost(
      financeByOrder,
      monthStart,
    );

    // 将历史物流费用合并到第一步返回的数据中
    historicalShippingCost.forEach((cost, orderId) => {
      if (financeByOrder.has(orderId)) {
        financeByOrder.get(orderId).shipping_cost += cost;
      }
    });

    // 3. 分组过滤数据
    const { userPaymentOrders, otherOrders } =
      filterInvalidOrders(financeByOrder);

    // 4. 处理 otherOrders，计算每个员工的平台收入总和（含广告费用）
    const employeePenaltyMap = await processOtherOrders(
      otherOrders,
      monthStart,
      monthEnd,
      targetEmployee,
    );
    // 5. 处理 userPaymentOrders，查询订单时间
    const enrichedUserPaymentOrders =
      await processUserPaymentOrders(userPaymentOrders);

    // 6. 查询供应链数据
    const finalUserPaymentOrders = await processSupplyChainData(
      enrichedUserPaymentOrders,
    );
    // 7. 计算收入和利润
    calculateProfit(finalUserPaymentOrders);

    // 8. 按 department 和 staff_name 聚合并插入数据库
    await insertEmployeeProfitData(
      targetMonth,
      finalUserPaymentOrders,
      employeePenaltyMap,
    );

    console.log("员工利润聚合完成");
  } catch (error) {
    console.error("员工利润聚合失败:", error);
    throw error;
  }
}

// 本地直接运行
if (require.main === module) {
  const year = process.argv[2];
  const month = process.argv[3];
  const targetEmployee = process.argv[4] || null;

  if (!year || !month) {
    console.error("请指定年份和月份，格式: 2026 2");
    process.exit(1);
  }

  const targetMonth = `${year}-${month.toString().padStart(2, "0")}`;

  aggregateEmployeeProfit(targetMonth, targetEmployee)
    .then(() => {
      console.log("员工利润聚合任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("员工利润聚合任务执行失败:", error);
      process.exit(1);
    });
}

module.exports = { aggregateEmployeeProfit };
