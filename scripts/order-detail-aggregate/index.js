const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);

const db = require("../../config/database");

// 美元汇率
// const USD_TO_CNY_RATE = 6.9826;
const USD_TO_CNY_RATE = 1;

// 交易类型配置
const { TRANSACTION_TYPES } = require("../../utils/transaction-types");
const { priceList } = require("../../utils/price-list");

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
        order_item_status,
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

    // 收集所有 order_item_id 用于查询财务数据
    const orderItemIds = orderDetails.map((item) => item.order_item_id);

    if (orderDetails.length === 0) {
      console.log("没有订单明细数据");
      return;
    }

    console.log(`找到 ${orderDetails.length} 条订单明细数据`);

    // 批量查询供应链明细（按order_id分组，但不聚合，保留所有记录）
    const orderIds = orderDetails.map((item) => item.order_id);
    const [supplyChainDetails] = await db.query(
      `
      SELECT
        business_no,
        sales_platform,
        store_name,
        order_amount,
        goods_amount,
        product_name,
        size,
        transaction_no,
        quantity
      FROM supply_chain_detail
      WHERE business_no IN (?)
      AND transaction_no IN (
          SELECT transaction_no
          FROM supply_chain_detail
          GROUP BY transaction_no
          HAVING SUM(quantity) <> 0
      )
      ORDER BY business_no
    `,
      [orderIds],
    );

    // 构建供应链数据映射（order_id -> 数组）
    const supplyChainMap = new Map();
    supplyChainDetails.forEach((item) => {
      if (!supplyChainMap.has(item.business_no)) {
        supplyChainMap.set(item.business_no, []);
      }
      supplyChainMap.get(item.business_no).push(item);
    });

    // 批量查询财务交易明细（按order_id分组）
    const [financeDetails] = await db.query(
      `
      SELECT
        order_id,
        order_item_id,
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
    const financeMap = new Map(); // order_id -> { shipping_cost, return_loss, platform_penalty }
    const financeItemMap = new Map(); // order_item_id -> { paid_amount, shipping_subsidy }

    financeDetails.forEach((item) => {
      // 订单级别数据初始化
      if (!financeMap.has(item.order_id)) {
        financeMap.set(item.order_id, {
          shipping_cost: 0,
          return_loss: 0,
          platform_penalty: 0,
        });
      }
      const financeData = financeMap.get(item.order_id);

      // 只有 Order Payment 和 Refund 才有 order_item_id
      if (item.order_item_id && !financeItemMap.has(item.order_item_id)) {
        financeItemMap.set(item.order_item_id, {
          paid_amount: 0,
          shipping_subsidy: 0,
        });
      }
      const itemFinanceData = item.order_item_id
        ? financeItemMap.get(item.order_item_id)
        : null;

      // 快递成本（订单级别）
      if (TRANSACTION_TYPES.SHIPPING_COST.includes(item.transaction_type)) {
        financeData.shipping_cost +=
          parseFloat(item.total || 0) * USD_TO_CNY_RATE;
      }

      // 平台补贴（订单项级别）：Order Payment 和 Refund，每个订单项用自己的 shipping
      if (TRANSACTION_TYPES.PLATFORM_SHIPPING.includes(item.transaction_type) && itemFinanceData) {
        itemFinanceData.shipping_subsidy +=
          parseFloat(item.shipping || 0) * USD_TO_CNY_RATE;
      }

      // 退货损耗（订单级别）
      if (TRANSACTION_TYPES.REFUND.includes(item.transaction_type)) {
        financeData.return_loss +=
          parseFloat(item.subtotal || 0) * USD_TO_CNY_RATE;
      }

      // 平台罚款（订单级别）
      if (TRANSACTION_TYPES.PLATFORM_PENALTY.includes(item.transaction_type)) {
        financeData.platform_penalty +=
          parseFloat(item.total || 0) * USD_TO_CNY_RATE;
      }

      // 用户支付金额（订单项级别）：Order Payment
      if (item.transaction_type === TRANSACTION_TYPES.USER_PAYMENT[0] && itemFinanceData) {
        itemFinanceData.paid_amount +=
          parseFloat(item.subtotal || 0) * USD_TO_CNY_RATE;
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
      const parts = storeName.split("-");
      return parts.length > 1 ? parts.slice(1).join("-").trim() : storeName;
    }

    // 计算每个 order_id 下的订单项数量（不是商品数量）
    const orderItemCountMap = new Map();
    orderDetails.forEach((item) => {
      const currentCount = orderItemCountMap.get(item.order_id) || 0;
      orderItemCountMap.set(item.order_id, currentCount + 1);
    });

    // 构建订单明细和供应链数据的对应关系
    // 记录每个order_id已经使用的供应链数据索引
    const supplyChainIndexMap = new Map();

    // 聚合最终数据
    const aggregateData = orderDetails.map((order) => {
      // 获取或初始化该order_id的索引
      let currentIndex = supplyChainIndexMap.get(order.order_id) || 0;
      const supplyChainArray = supplyChainMap.get(order.order_id) || [];

      // 获取对应索引的供应链数据
      const supplyChainData = supplyChainArray[currentIndex] || null;

      // 更新索引，下次使用下一条
      supplyChainIndexMap.set(order.order_id, currentIndex + 1);

      const financeData = financeMap.get(order.order_id) || {
        shipping_cost: 0,
        return_loss: 0,
        platform_penalty: 0,
      };

      // 获取订单项级别的财务数据
      const itemFinanceData = financeItemMap.get(order.order_item_id) || {
        paid_amount: 0,
        shipping_subsidy: 0,
      };

      // 获取该订单下的订单项数量
      const totalItemCount = orderItemCountMap.get(order.order_id) || 1;

      // 按订单项数量比例平均分配快递成本、平台罚款、退货损耗
      const shippingCostPerItem = financeData.shipping_cost / totalItemCount;
      const platformPenaltyPerItem =
        financeData.platform_penalty / totalItemCount;
      const returnLossPerItem = financeData.return_loss / totalItemCount;

      // 获取工厂价格（2026-03-04之前包括03-04使用工厂价格）
      let factoryPrice = null;
      const cutoffDate = new Date("2026-03-04T23:59:59");
      const orderDate = new Date(order.purchase_date_china);

      if (orderDate <= cutoffDate) {
        const category = mapCategory(supplyChainData?.product_name);
        const size = supplyChainData?.size;
        if (category && priceList[category] && priceList[category][size]) {
          // 工厂价格单价 × 数量
          factoryPrice = priceList[category][size] * (order.quantity || 1);
        }
      }

      // 使用工厂价格替代 goods_amount（如果存在工厂价格）
      const orderAmount = factoryPrice !== null ? factoryPrice : (supplyChainData?.goods_amount || 0);

      // 计算 total_amount
      let totalAmount;
      if (order.order_status === "Canceled") {
        // 取消的订单，total_amount = 0
        totalAmount = 0;
      } else {
        // 正常订单：paid_amount + shipping_cost + shipping_subsidy + platform_penalty + return_loss - order_amount
        totalAmount =
          itemFinanceData.paid_amount +
          shippingCostPerItem +
          itemFinanceData.shipping_subsidy +
          platformPenaltyPerItem +
          returnLossPerItem -
          orderAmount;
      }

      return [
        order.order_id,
        order.order_item_id,
        order.order_status,
        order.order_item_status,
        order.order_settlement_status,
        order.quantity,
        order.price * USD_TO_CNY_RATE, // price 转为人民币
        order.purchase_date_china,
        order.department,
        order.staff_name,
        null, // staff_status
        shippingCostPerItem, // 按数量比例平均分配快递成本
        itemFinanceData.shipping_subsidy, // 平台补贴（订单项级别）
        platformPenaltyPerItem, // 按数量比例平均分配平台罚款
        returnLossPerItem, // 按数量比例平均分配退货损耗
        supplyChainData?.sales_platform || null,
        extractStoreName(supplyChainData?.store_name) || null, // store_name 处理 - 后面的部分
        orderAmount, // 使用工厂价格或 goods_amount
        itemFinanceData.paid_amount, // 用户支付金额
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
          () =>
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .join(", ");
      const values = batch.flat();

      await db.query(
        `
        INSERT INTO order_detail_aggregate (
          order_id, order_item_id, order_status, order_item_status, order_settlement_status,
          quantity, price, purchase_date_china, department, staff_name,
          staff_status, shipping_cost, shipping_subsidy, platform_penalty,
          return_loss, sales_platform, store_name, order_amount, paid_amount,
          category, variation, total_amount
        ) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          order_status = VALUES(order_status),
          order_item_status = VALUES(order_item_status),
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
          paid_amount = VALUES(paid_amount),
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
