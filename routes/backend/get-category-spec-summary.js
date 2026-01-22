// 获取品类规格汇总数据
const { backendAuth } = require("../../middleware/backend-auth");
const db = require("../../config/database");

// 获取出厂价的辅助函数
function getFactoryPrice(category, specification) {
  const FACTORY_PRICES = {
    T恤: 18,
    卫衣: 35,
    毛毯: {
      "30*40": 20,
      "40*50": 30,
      "50*60": 40,
      "60*80": 50,
    },
    挂毯: {
      "30*40": 20,
      "40*60": 35,
      "50*60": 40,
      "60*80": 50,
      "60*90": 50,
    },
    窗帘: {
      "52*63": 50,
      "52*84": 50,
    },
    帽子: {
      牛仔帽: 18,
      三明治帽: 18,
    },
    地垫: {
      "40*60": 25,
      "43*75": 30,
      "43*120": 35,
    },
    鼠标垫: {
      "30*80": 20,
      "80*30": 20,
    },
  };

  const categoryPrice = FACTORY_PRICES[category];
  if (typeof categoryPrice === "number") return categoryPrice;
  if (typeof categoryPrice === "object" && categoryPrice[specification]) {
    return categoryPrice[specification];
  }
  return 0;
}

// 美元汇率
const USD_RATE = 6.9826;

// 计算底价的辅助函数
function calculateBasePrice(item, category) {
  const factoryPrice = getFactoryPrice(category, item.specification);
  const avgShippingCost = parseFloat(item.avg_shipping_cost) || 0;
  const avgPlatformSubsidy = parseFloat(item.total_platform_subsidy) || 0;
  const avgPlatformPenalty = parseFloat(item.total_platform_penalty) || 0;
  const avgReturnLoss = parseFloat(item.total_return_loss) || 0;
  const avgResendLoss = parseFloat(item.total_resend_loss) || 0;

  return (
    factoryPrice / USD_RATE +
    avgShippingCost * -1 +
    avgReturnLoss * -1 -
    avgResendLoss -
    avgPlatformSubsidy -
    avgPlatformPenalty
  );
}

// 构建查询的辅助函数
function buildQuery(category, startDateStr, endDateStr, extraFilters) {
  const whereConditions = [
    "category = ?",
    "report_date >= ?",
    "report_date <= ?",
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
      specification,
      SUM(shipping_cost)/SUM(NULLIF(sales_volume, 0)) as avg_shipping_cost,
      SUM(platform_subsidy)/SUM(NULLIF(sales_volume, 0)) as total_platform_subsidy,
      SUM(platform_penalty)/SUM(NULLIF(sales_volume, 0)) as total_platform_penalty,
      SUM(return_loss)/SUM(NULLIF(sales_volume, 0)) as total_return_loss,
      SUM(resend_loss)/SUM(NULLIF(sales_volume, 0)) as total_resend_loss
    FROM sales_report_daily
    WHERE ${whereConditions.join(" AND ")}
    GROUP BY category, specification
    ORDER BY specification`,
    params: queryParams,
  };
}

// 处理查询结果并计算底价
function processQueryResults(data, category) {
  const prices = {};
  data.forEach((item) => {
    const price = calculateBasePrice(item, category);
    prices[item.specification] = `$${price.toFixed(4)}`;
  });
  return prices;
}

async function getCategorySpecSummary(req, res) {
  try {
    const { category, start_date, end_date } = req.query;
    const { username: staff_name, department } = req.user || {};

    if (!category) {
      return res.status(400).json({
        code: 400,
        message: "品类参数不能为空",
      });
    }

    const today = new Date();
    const startDate = start_date ? new Date(start_date) : new Date(today);
    const endDate = end_date ? new Date(end_date) : new Date(today);

    if (!start_date) startDate.setDate(startDate.getDate() - 45);
    if (!end_date) endDate.setDate(endDate.getDate() - 15);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // 并行查询公司底价、部门底价和个人数据
    const [companyQueryResult, deptQueryResult, personalQueryResult] =
      await Promise.all([
        db.query(
          buildQuery(category, startDateStr, endDateStr, {}).sql,
          buildQuery(category, startDateStr, endDateStr, {}).params
        ),
        db.query(
          buildQuery(category, startDateStr, endDateStr, { department }).sql,
          buildQuery(category, startDateStr, endDateStr, { department }).params
        ),
        db.query(
          buildQuery(category, startDateStr, endDateStr, {
            staff_name,
            department,
          }).sql,
          buildQuery(category, startDateStr, endDateStr, {
            staff_name,
            department,
          }).params
        ),
      ]);

    const companyBasePrices = processQueryResults(
      companyQueryResult[0],
      category
    );
    const deptBasePrices = processQueryResults(deptQueryResult[0], category);

    const [categories] = await db.query(
      `SELECT DISTINCT category FROM sales_report_daily WHERE category IS NOT NULL ORDER BY category`
    );

    // 如果个人数据为空，使用公司数据
    const dataSource =
      personalQueryResult[0].length > 0
        ? personalQueryResult[0]
        : companyQueryResult[0];

    const formattedData = dataSource.map((item) => {
      const factoryPrice = getFactoryPrice(category, item.specification);
      const avgShippingCost = parseFloat(item.avg_shipping_cost) || 0;
      const avgPlatformSubsidy = parseFloat(item.total_platform_subsidy) || 0;
      const avgPlatformPenalty = parseFloat(item.total_platform_penalty) || 0;
      const avgReturnLoss = parseFloat(item.total_return_loss) || 0;
      const avgResendLoss = parseFloat(item.total_resend_loss) || 0;
      const personalBasePrice =
        factoryPrice / USD_RATE +
        avgShippingCost * -1 +
        avgReturnLoss * -1 -
        avgResendLoss -
        avgPlatformSubsidy -
        avgPlatformPenalty;

      return {
        category: item.category,
        specification: item.specification,
        factory_price: `¥${factoryPrice.toFixed(2)}/$${(
          factoryPrice / USD_RATE
        ).toFixed(4)}`,
        shipping_cost: `$${avgShippingCost.toFixed(4)}`,
        platform_subsidy: `$${avgPlatformSubsidy.toFixed(4)}`,
        platform_penalty: `$${avgPlatformPenalty.toFixed(4)}`,
        return_loss: `$${avgReturnLoss.toFixed(4)}`,
        resend_loss: `$${avgResendLoss.toFixed(4)}`,
        personal_base_price:
          personalQueryResult[0].length > 0
            ? `$${personalBasePrice.toFixed(4)}`
            : null,
        dept_base_price:
          deptQueryResult[0].length > 0
            ? deptBasePrices[item.specification] || null
            : null,
        company_base_price: companyBasePrices[item.specification] || null,
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
