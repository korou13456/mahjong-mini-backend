// 后台管理路由统一入口
const express = require("express");
const router = express.Router();
const { backendAuth } = require("../../middleware/backend-auth");

// 根路由
router.get("/", (req, res) => {
  res.json({
    code: 200,
    message: "后台管理 API",
  });
});

// 登录接口
router.post("/login", require("./login"));
// 验证 token 有效
router.get("/verify-token", backendAuth, require("./verify-token"));
// 修改密码
router.post("/change-password", backendAuth, require("./change-password"));
// 批量导入销售报表
router.post(
  "/batch-import-sales",
  backendAuth,
  require("./batch-import-sales"),
);
// 批量导入订单
router.post(
  "/batch-import-orders",
  backendAuth,
  require("./batch-import-orders"),
);
// 获取运营日报数据
router.get("/sales-daily", backendAuth, require("./get-sales-daily"));
// 获取运营周报数据
router.get("/sales-weekly", backendAuth, require("./get-sales-weekly"));
// 获取品类规格汇总数据
router.get(
  "/category-spec-summary",
  backendAuth,
  require("./get-category-spec-summary"),
);
// 获取月度提成报表
router.get("/month-report", backendAuth, require("./get-month-report"));
// 获取订单商品聚合数据
router.get(
  "/order-product-aggregate",
  backendAuth,
  require("./get-order-product-aggregate"),
);
// 根据订单ID查询收件人信息
router.get(
  "/recipient-by-order-id",
  backendAuth,
  require("./get-recipient-by-order-id"),
);
// 获取管理员用户列表
router.get("/admin-users", backendAuth, require("./get-admin-users"));

// 路由权限管理
router.use("/router_permission", backendAuth, require("./router_permission"));

// 库存管理
router.use("/inventory_blanket", require("./inventory_management/blanket"));
router.use("/inventory_tshirt", require("./inventory_management/tshirt"));
router.use("/inventory_tapestry", require("./inventory_management/tapestry"));
router.use("/inventory_doormat", require("./inventory_management/doormat"));
router.use("/inventory_hat", require("./inventory_management/hat"));
router.use("/inventory_curtain", require("./inventory_management/curtain"));
router.use("/inventory_mousepad", require("./inventory_management/mousepad"));
router.use(
  "/inventory_sweatshirt",
  require("./inventory_management/sweatshirt"),
);

// 其他后台接口可以继续添加
// router.get('/users', backendAuth, require('./users'));
// router.post('/users', backendAuth, require('./users/create'));
// router.delete('/users/:id', backendAuth, roleAuth(['admin']), require('./users/delete'));

module.exports = router;
