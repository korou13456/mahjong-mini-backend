const db = require("../../config/database");

// 获取月度提成报表
module.exports = async (req, res) => {
  try {
    const { month, department, employee } = req.query;

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (month) {
      conditions.push("month = ?");
      params.push(month);
    }

    if (department) {
      conditions.push("department = ?");
      params.push(department);
    }

    if (employee) {
      conditions.push("employee LIKE ?");
      params.push(`%${employee}%`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 查询详细数据
    const [rows] = await db.query(
      `SELECT
        id,
        month,
        department,
        employee,
        total_income,
        total_profit,
        team_total_profit,
        personal_commission,
        team_commission,
        created_at,
        updated_at
      FROM month_report
      ${whereClause}
      ORDER BY month DESC, department, employee`,
      params,
    );

    // 获取可用的部门列表
    const [departments] = await db.query(
      `SELECT DISTINCT department FROM month_report ORDER BY department`,
    );

    // 获取可用的员工列表
    const [employees] = await db.query(
      `SELECT DISTINCT employee FROM month_report ORDER BY employee`,
    );

    res.json({
      code: 200,
      data: {
        list: rows,
        departments: departments.map((d) => d.department),
        employees: employees.map((e) => e.employee),
      },
    });
  } catch (error) {
    console.error("获取月度提成报表失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取月度提成报表失败",
      error: error.message,
    });
  }
};
