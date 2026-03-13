// 汇率常量
const EXCHANGE_RATE = 6.9826;

// 格式化价格为人民币/美元格式
function formatPrice(priceInCNY) {
  const usd = priceInCNY / EXCHANGE_RATE;
  return `¥${priceInCNY.toFixed(2)}/$${usd.toFixed(2)}`;
}

// 获取品类规格汇总数据
const { backendAuth } = require("../../middleware/backend-auth");
const db = require("../../config/database");

// 计算底价的辅助函数（人民币）
function calculateBasePrice(item) {
  const factoryPrice = parseFloat(item.avg_order_amount) || 0;
  const avgShippingCost = parseFloat(item.avg_shipping_cost) || 0;
  const avgPlatformSubsidy = parseFloat(item.total_platform_subsidy) || 0;
  const avgPlatformPenalty = parseFloat(item.total_platform_penalty) || 0;
  const avgReturnLoss = parseFloat(item.total_return_loss) || 0;
  const avgResendLoss = parseFloat(item.total_resend_loss) || 0;

  // 数据源已经是人民币，所以不需要汇率转换
  return (
    factoryPrice -
    avgShippingCost -
    avgReturnLoss -
    avgResendLoss -
    avgPlatformSubsidy -
    avgPlatformPenalty
  );
}

// 构建查询的辅助函数
function buildQuery(category, startDateStr, endDateStr, extraFilters) {
  const whereConditions = [
    "category = ?",
    "DATE(purchase_date_china) >= ?",
    "DATE(purchase_date_china) <= ?",
    "paid_amount != 0",
  ];
  const queryParams = [category, startDateStr, endDateStr];

  for (const [key, value] of Object.entries(extraFilters)) {
    if (value) {
      whereConditions.push(`${key} = ?`);
      queryParams.push(value);
    }
  }

  return {
    sql: `SELECT
      category,
      variation as specification,
      SUM(order_amount)/SUM(NULLIF(quantity, 0)) as avg_order_amount,
      SUM(shipping_cost)/SUM(NULLIF(quantity, 0)) as avg_shipping_cost,
      SUM(shipping_subsidy)/SUM(NULLIF(quantity, 0)) as total_platform_subsidy,
      SUM(platform_penalty)/SUM(NULLIF(quantity, 0)) as total_platform_penalty,
      SUM(return_loss)/SUM(NULLIF(quantity, 0)) as total_return_loss,
      0 as total_resend_loss
    FROM order_detail_aggregate
    WHERE ${whereConditions.join(" AND ")}
    GROUP BY category, variation
    ORDER BY variation`,
    params: queryParams,
  };
}

// 处理查询结果并计算底价（人民币）
function processQueryResults(data) {
  const prices = {};
  data.forEach((item) => {
    const price = calculateBasePrice(item);
    prices[item.specification] = `¥${price.toFixed(2)}`;
  });
  return prices;
}

async function getCategorySpecSummary(req, res) {
  try {
    const { category, start_date, end_date } = req.query;

    // 查询所有品类（无论是否有category参数）
    const [categories] = await db.query(
      `SELECT DISTINCT category FROM order_detail_aggregate WHERE category IS NOT NULL ORDER BY category`,
    );

    // 如果品类参数为空，只返回品类列表
    if (!category) {
      return res.json({
        code: 200,
        message: "查询成功",
        data: {
          category: null,
          date_range: null,
          categories: categories.map((c) => c.category),
          list: [],
        },
      });
    }

    const today = new Date();
    const startDate = start_date ? new Date(start_date) : new Date(today);
    const endDate = end_date ? new Date(end_date) : new Date(today);

    if (!start_date) startDate.setDate(startDate.getDate() - 60);
    if (!end_date) endDate.setDate(endDate.getDate() - 15);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // 查询公司底价数据
    const { sql, params } = buildQuery(category, startDateStr, endDateStr, {});
    const [companyQueryResult] = await db.query(sql, params);

    if (companyQueryResult.length === 0) {
      return res.json({
        code: 200,
        message: "查询成功",
        data: {
          category,
          date_range: {
            start: startDateStr,
            end: endDateStr,
          },
          categories: categories.map((c) => c.category),
          list: [],
        },
      });
    }

    const formattedData = companyQueryResult.map((item) => {
      // 直接使用表里的工厂价格
      const factoryPrice = parseFloat(item.avg_order_amount) || 0;

      const avgShippingCost = parseFloat(item.avg_shipping_cost) || 0;
      const avgPlatformSubsidy = parseFloat(item.total_platform_subsidy) || 0;
      const avgPlatformPenalty = parseFloat(item.total_platform_penalty) || 0;
      const avgReturnLoss = parseFloat(item.total_return_loss) || 0;
      const avgResendLoss = parseFloat(item.total_resend_loss) || 0;

      // 计算公司底价（人民币）
      const basePrice =
        factoryPrice -
        avgShippingCost -
        avgReturnLoss -
        avgResendLoss -
        avgPlatformSubsidy -
        avgPlatformPenalty;

      return {
        category: item.category,
        specification: item.specification,
        factory_price: formatPrice(factoryPrice),
        shipping_cost: formatPrice(avgShippingCost),
        platform_subsidy: formatPrice(avgPlatformSubsidy),
        platform_penalty: formatPrice(avgPlatformPenalty),
        return_loss: formatPrice(avgReturnLoss),
        resend_loss: formatPrice(avgResendLoss),
        company_base_price: formatPrice(basePrice),
      };
    });

    res.json({
      code: 200,
      message: "查询成功",
      data: {
        category,
        date_range: {
          start: startDateStr,
          end: endDateStr,
        },
        categories: categories.map((c) => c.category),
        list: formattedData,
      },
    });
  } catch (error) {
    console.error("获取品类规格汇总数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getCategorySpecSummary;
