const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);

const db = require("../../config/database");

// 美元汇率
const USD_TO_CNY_RATE = 6.9826;

// 聚合订单明细数据
async function aggregateOrderDetail() {
  console.log("开始聚合订单明细数据...");

  try {
    // 查询订单明细数据
    const [orderDetails] = await db.query(`
      SELECT
        order_id,
        order_item_id,
        order_status,
        order_settlement_status,
        quantity,
        price,
        purchase_date_china,
        department,
        staff_name
      FROM order_detail
    `);

    if (orderDetails.length === 0) {
      console.log("没有订单明细数据");
      return;
    }

    console.log(`找到 ${orderDetails.length} 条订单明细数据`);

    // 批量查询供应链明细（按order_id分组）
    const orderIds = orderDetails.map((item) => item.order_id);
    const [supplyChainDetails] = await db.query(
      `
      SELECT
        business_no,
        sales_platform,
        store_name,
        SUM(order_amount) as total_order_amount,
        MIN(product_name) as product_name,
        MIN(size) as size
      FROM supply_chain_detail
      WHERE business_no IN (?)
      GROUP BY business_no, sales_platform, store_name
    `,
      [orderIds],
    );

    // 构建供应链数据映射（business_no -> 数据）
    const supplyChainMap = new Map();
    supplyChainDetails.forEach((item) => {
      supplyChainMap.set(item.business_no, item);
    });

    // 批量查询财务交易明细（按order_id分组）
    const [financeDetails] = await db.query(
      `
      SELECT
        order_id,
        transaction_type,
        sku_id,
        subtotal,
        shipping,
        total
      FROM finance_transaction_detail
      WHERE order_id IN (?)
    `,
      [orderIds],
    );

    // 聚合财务数据
    const financeMap = new Map(); // order_id -> { shipping_cost, shipping_subsidy, return_loss, platform_penalty }

    financeDetails.forEach((item) => {
      if (!financeMap.has(item.order_id)) {
        financeMap.set(item.order_id, {
          shipping_cost: 0,
          shipping_subsidy: 0,
          return_loss: 0,
          platform_penalty: 0,
        });
      }

      const financeData = financeMap.get(item.order_id);

      // 快递成本
      if (
        [
          "Shipping label purchase",
          "Shipping label purchase adjustment",
          "Shipping label for return purchase adjustment",
        ].includes(item.transaction_type)
      ) {
        financeData.shipping_cost += parseFloat(item.total || 0) * USD_TO_CNY_RATE;
      }

      // 平台补贴
      if (["Order Payment", "Refund"].includes(item.transaction_type)) {
        financeData.shipping_subsidy += parseFloat(item.shipping || 0) * USD_TO_CNY_RATE;
      }

      // 退货损耗
      if (
        [
          "Refund",
          "Shipping label for return purchase",
          "Platform reimbursement",
          "Shipping label for return purchase covered by platform",
          "Chargeback processing fee",
        ].includes(item.transaction_type)
      ) {
        financeData.return_loss += parseFloat(item.subtotal || 0) * USD_TO_CNY_RATE;
      }

      // 平台罚款
      if (item.transaction_type === "Delayed fulfillment deduction") {
        financeData.platform_penalty += parseFloat(item.total || 0) * USD_TO_CNY_RATE;
      }
    });

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

      // 都没匹配到，返回原值
      return productName;
    }

    // 处理 store_name，提取 - 后面的部分
    function extractStoreName(storeName) {
      if (!storeName) return null;
      const parts = storeName.split('-');
      return parts.length > 1 ? parts.slice(1).join('-').trim() : storeName;
    }
    // 聚合最终数据
    const aggregateData = orderDetails.map((order) => {
      const supplyChainData = supplyChainMap.get(order.order_id);
      const financeData = financeMap.get(order.order_id) || {
        shipping_cost: 0,
        shipping_subsidy: 0,
        return_loss: 0,
        platform_penalty: 0,
      };

      // 计算 total_amount
      let totalAmount;
      if (order.order_status === 'Canceled') {
        // 取消的订单，total_amount = 0
        totalAmount = 0;
      } else {
        // 正常订单：price + shipping_cost + shipping_subsidy + platform_penalty + return_loss - order_amount
        const price = order.price * USD_TO_CNY_RATE;
        const orderAmount = supplyChainData?.total_order_amount || 0;
        totalAmount = price + financeData.shipping_cost + financeData.shipping_subsidy + financeData.platform_penalty + financeData.return_loss - orderAmount;
      }

      return [
        order.order_id,
        order.order_item_id,
        order.order_status,
        order.order_settlement_status,
        order.quantity,
        order.price * USD_TO_CNY_RATE, // price 转为人民币
        order.purchase_date_china,
        order.department,
        order.staff_name,
        null, // staff_status
        financeData.shipping_cost,
        financeData.shipping_subsidy,
        financeData.platform_penalty,
        financeData.return_loss,
        supplyChainData?.sales_platform || null,
        extractStoreName(supplyChainData?.store_name) || null, // store_name 处理 - 后面的部分
        supplyChainData?.total_order_amount || null, // order_amount 不转换，已经是人民币
        mapCategory(supplyChainData?.product_name) || null, // category
        supplyChainData?.size || null, // variation
        totalAmount, // total_amount
      ];
    });

    // 批量插入或更新
    console.log("插入/更新聚合数据...");
    const batchSize = 500;
    for (let i = 0; i < aggregateData.length; i += batchSize) {
      const batch = aggregateData.slice(i, i + batchSize);
      const placeholders = batch
        .map(
          () => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .join(", ");
      const values = batch.flat();

      await db.query(
        `
        INSERT INTO order_detail_aggregate (
          order_id, order_item_id, order_status, order_settlement_status,
          quantity, price, purchase_date_china, department, staff_name,
          staff_status, shipping_cost, shipping_subsidy, platform_penalty,
          return_loss, sales_platform, store_name, order_amount,
          category, variation, total_amount
        ) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          order_status = VALUES(order_status),
          order_settlement_status = VALUES(order_settlement_status),
          quantity = VALUES(quantity),
          price = VALUES(price),
          purchase_date_china = VALUES(purchase_date_china),
          department = VALUES(department),
          staff_name = VALUES(staff_name),
          staff_status = VALUES(staff_status),
          shipping_cost = VALUES(shipping_cost),
          shipping_subsidy = VALUES(shipping_subsidy),
          platform_penalty = VALUES(platform_penalty),
          return_loss = VALUES(return_loss),
          sales_platform = VALUES(sales_platform),
          store_name = VALUES(store_name),
          order_amount = VALUES(order_amount),
          category = VALUES(category),
          variation = VALUES(variation),
          total_amount = VALUES(total_amount)
      `,
        values,
      );

      console.log(
        `已处理 ${Math.min(i + batchSize, aggregateData.length)}/${aggregateData.length} 条数据`,
      );
    }

    console.log(`订单明细聚合完成，处理了 ${aggregateData.length} 条数据`);
  } catch (error) {
    console.error("订单明细聚合失败:", error);
    throw error;
  }
}

// 本地直接运行
if (require.main === module) {
  aggregateOrderDetail()
    .then(() => {
      console.log("聚合任务执行完毕");
      process.exit(0);
    })
    .catch((error) => {
      console.error("聚合任务执行失败:", error);
      process.exit(1);
    });
}

module.exports = { aggregateOrderDetail };
