// 获取运营日报数据
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../middleware/backend-auth");
const db = require("../../config/database");

async function getSalesDaily(req, res) {
  try {
    const {
      department,
      staff_name,
      report_date,
      category,
      specification,
      page = 1,
      pagesize = 20,
    } = req.query;

    // 参数校验
    const pageSize = Math.min(Math.max(parseInt(pagesize) || 20, 1), 100);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const offset = (pageNum - 1) * pageSize;

    // 处理日期范围，默认15天，最长60天
    let dateRange = 15;
    if (report_date) {
      dateRange = parseInt(report_date);
      if (dateRange < 1) dateRange = 1;
      if (dateRange > 60) dateRange = 60;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);
    const startDateStr = startDate.toISOString().split("T")[0];

    // 构建 WHERE 条件
    const conditions = [`report_date >= ?`];
    const params = [startDateStr];

    // 处理数组参数，支持数组格式或JSON格式
    const processArrayParam = (param, fieldName) => {
      if (!param) return;

      let arr = [];

      // 如果是字符串，尝试解析 JSON 数组
      if (typeof param === "string") {
        // 处理字面量 '[]' 的情况
        if (param === "[]") {
          return; // 空数组，不添加条件
        }

        // 支持单引号和双引号的数组格式
        if (param.startsWith("[") || param.startsWith("[")) {
          try {
            // 先尝试直接解析
            arr = JSON.parse(param);
            console.log(`解析 ${fieldName} 成功:`, arr);
          } catch (e) {
            console.log(`解析 ${fieldName} 失败，尝试替换单引号:`, e.message);
            // 如果失败，尝试将单引号替换为双引号后再解析
            try {
              const fixedParam = param.replace(/'/g, '"');
              arr = JSON.parse(fixedParam);
              console.log(`替换单引号后解析 ${fieldName} 成功:`, arr);
            } catch (e2) {
              // 还是失败，用逗号分隔
              console.log(`替换后仍然失败，使用逗号分隔`);
              arr = param.split(",");
            }
          }
        } else {
          // 普通字符串，用逗号分隔
          arr = param.split(",");
        }
      } else if (Array.isArray(param)) {
        // 已经是数组了
        arr = param;
      }

      // 过滤空值
      arr = arr.filter((item) => item && item.trim() !== "");

      if (arr.length > 0) {
        conditions.push(`${fieldName} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    };

    processArrayParam(department, "department");
    processArrayParam(staff_name, "staff_name");
    processArrayParam(category, "category");
    processArrayParam(specification, "specification");
    const whereClause = conditions.join(" AND ");

    // 查询总数
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM sales_report_daily WHERE ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // 查询数据
    const [data] = await db.query(
      `SELECT
        id,
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
        resend_loss
      FROM sales_report_daily
      WHERE ${whereClause}
      ORDER BY report_date DESC, id DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // 查询汇总数据（所有符合条件的记录）
    const [summary] = await db.query(
      `SELECT
        SUM(sales_volume) as total_sales_volume,
        SUM(sales_amount) as total_sales_amount,
        SUM(shipping_cost) as total_shipping_cost,
        SUM(platform_subsidy) as total_platform_subsidy,
        SUM(return_loss) as total_return_loss,
        SUM(resend_loss) as total_resend_loss
      FROM sales_report_daily
      WHERE ${whereClause}`,
      params
    );

    // 查询可选值列表
    const [departments] = await db.query(
      `SELECT DISTINCT department FROM sales_report_daily WHERE department IS NOT NULL ORDER BY department`
    );
    const [staffs] = await db.query(
      `SELECT DISTINCT staff_name FROM sales_report_daily WHERE staff_name IS NOT NULL ORDER BY staff_name`
    );
    const [categories] = await db.query(
      `SELECT DISTINCT category FROM sales_report_daily WHERE category IS NOT NULL ORDER BY category`
    );
    const [specifications] = await db.query(
      `SELECT DISTINCT category, specification FROM sales_report_daily WHERE specification IS NOT NULL ORDER BY category, specification`
    );

    // 按品类分组规格
    const categorySpecifications = {};
    specifications.forEach(({ category, specification }) => {
      if (!categorySpecifications[category]) {
        categorySpecifications[category] = [];
      }
      categorySpecifications[category].push(specification);
    });

    res.json({
      code: 200,
      message: "查询成功",
      data: {
        list: data,
        summary: {
          sales_volume: parseInt(summary[0].total_sales_volume) || 0,
          sales_amount: parseFloat(summary[0].total_sales_amount) || 0,
          shipping_cost: parseFloat(summary[0].total_shipping_cost) || 0,
          platform_subsidy: parseFloat(summary[0].total_platform_subsidy) || 0,
          return_loss: parseFloat(summary[0].total_return_loss) || 0,
          resend_loss: parseFloat(summary[0].total_resend_loss) || 0,
        },
        filters: {
          departments: departments.map((d) => d.department),
          staffs: staffs.map((s) => s.staff_name),
          categories: categories.map((c) => c.category),
          categorySpecifications,
        },
        pagination: {
          page: pageNum,
          pagesize: pageSize,
          total: total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("获取运营日报数据失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getSalesDaily;
