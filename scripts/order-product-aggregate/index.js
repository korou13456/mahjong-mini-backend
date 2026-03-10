const nodeEnv = process.env.NODE_ENV || "development";
const envFile = nodeEnv === "production" ? ".env.production" : ".env";

require("dotenv").config({
  path: require("path").resolve(process.cwd(), envFile),
});
console.log(`加载环境配置文件: ${envFile}`);
const cron = require("node-cron");
const db = require("../../config/database");

// 聚合订单商品数据
async function aggregateOrderProduct() {
  console.log("开始聚合订单商品数据...");

  try {
    // 计算三个月前的日期
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().split("T")[0];

    console.log(`聚合日期范围: ${threeMonthsAgoStr} 到今天`);

    // 查询订单明细数据
    const [orderDetails] = await db.query(
      `
      SELECT
        order_id,
        DATE(purchase_date_china) as data_time,
        department,
        staff_name,
        quantity,
        price
      FROM order_detail
      WHERE purchase_date_china >= ?
    `,
      [threeMonthsAgoStr],
    );

    if (orderDetails.length === 0) {
      console.log("没有订单明细数据");
      return;
    }

    console.log(`找到 ${orderDetails.length} 条订单明细数据`);

    // 收集所有 order_id
    const orderIds = orderDetails.map((item) => item.order_id);

    // 批量查询供应链数据，获取品类和规格
    const [supplyChainData] = await db.query(
      `
      SELECT DISTINCT
        business_no,
        product_name,
        size
      FROM supply_chain_detail
      WHERE business_no IN (?)
    `,
      [orderIds],
    );

    // 构建 order_id -> { category, variation } 映射
    const supplyChainMap = new Map();
    supplyChainData.forEach((item) => {
      if (!supplyChainMap.has(item.business_no)) {
        const category = mapCategory(item.product_name);
        supplyChainMap.set(item.business_no, {
          category: category || item.product_name,
          variation: item.size,
        });
      }
    });

    // 映射品类名称
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

    // 聚合数据
    const aggregateMap = new Map(); // key: data_time|category|variation|department|staff_name

    orderDetails.forEach((order) => {
      const supplyChainInfo = supplyChainMap.get(order.order_id);
      const category = supplyChainInfo?.category || null;
      const variation = supplyChainInfo?.variation || null;

      if (!category) return; // 如果没有品类信息，跳过

      const key = `${order.data_time}|${category}|${variation}|${order.department}|${order.staff_name}`;

      if (!aggregateMap.has(key)) {
        aggregateMap.set(key, {
          data_time: order.data_time,
          category: category,
          variation: variation,
          department: order.department,
          staff_name: order.staff_name,
          quantity: 0,
          order_count: 0,
          price: 0,
          order_ids: new Set(),
        });
      }

      const aggData = aggregateMap.get(key);
      aggData.quantity += order.quantity;
      aggData.order_ids.add(order.order_id);
      aggData.price += order.price * order.quantity;
    });

    // 转换为数组
    const aggregateData = Array.from(aggregateMap.values()).map((item) => ({
      ...item,
      order_count: item.order_ids.size,
    }));

    if (aggregateData.length === 0) {
      console.log("没有需要聚合的数据");
      return;
    }

    console.log(`聚合得到 ${aggregateData.length} 条数据`);

    // 批量删除旧数据
    await db.query(`DELETE FROM order_product_aggregate WHERE data_time >= ?`, [
      threeMonthsAgoStr,
    ]);

    // 批量插入新数据
    const batchSize = 500;
    for (let i = 0; i < aggregateData.length; i += batchSize) {
      const batch = aggregateData.slice(i, i + batchSize);
      const values = batch.flatMap((item) => [
        item.category,
        item.variation,
        item.quantity,
        item.order_count,
        item.price,
        item.department,
        item.staff_name,
        item.data_time,
      ]);

      const placeholders = batch
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");

      await db.query(
        `INSERT INTO order_product_aggregate
         (category, variation, quantity, order_count, price, department, staff_name, data_time)
         VALUES ${placeholders}`,
        values,
      );

      console.log(
        `已处理 ${Math.min(i + batchSize, aggregateData.length)}/${
          aggregateData.length
        } 条数据`,
      );
    }

    console.log(`订单商品数据聚合完成，处理了 ${aggregateData.length} 条数据`);
  } catch (error) {
    console.error("订单商品数据聚合失败:", error);
    throw error;
  }
}

// 每天 00:00 执行聚合
cron.schedule("0 19 * * *", async () => {
  console.log("定时任务触发: 订单商品聚合");
  await aggregateOrderProduct();
});

// PM2 启动时保持进程运行
if (require.main === module) {
  // 检查是否是 PM2 运行环境
  const isPM2 = process.env.pm_id !== undefined;

  if (isPM2) {
    // PM2 环境：设置就绪信号并保持运行，等待定时触发
    if (process.send) {
      process.send("ready");
    }
    console.log("订单商品聚合任务已启动（PM2模式），等待定时触发...");
  } else {
    // 本地直接运行：立即执行一次
    console.log("订单商品聚合任务（本地模式），立即执行...");
    aggregateOrderProduct()
      .then(() => {
        console.log("聚合任务执行完毕");
        process.exit(0);
      })
      .catch((error) => {
        console.error("聚合任务执行失败:", error);
        process.exit(1);
      });
    return; // 提前返回，不执行下面的信号监听
  }

  // 保持进程运行，不让进程退出
  // node-cron 定时任务会持续运行
  process.on("SIGINT", () => {
    console.log("\n收到退出信号，正在关闭...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n收到终止信号，正在关闭...");
    process.exit(0);
  });
}

module.exports = { aggregateOrderProduct };
