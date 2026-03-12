// 交易类型配置
const TRANSACTION_TYPES = {
  // 用户支付 .subtotal
  USER_PAYMENT: ["Order Payment"],

  // 平台物流补贴  .shipping
  PLATFORM_SHIPPING: ["Order Payment", "Refund"],

  // 物流费用 .total
  SHIPPING_COST: [
    "Shipping label purchase", // 购买发货运单
  ],

  // 物流调整费用 .total
  SHIPPING_COST_ADJUSTMENT: [
    "Shipping label purchase adjustment", // 发货运单费用调整
  ],

  // 退货产生的物流费用 .total
  SHIPPING_COST_RETURN: [
    "Shipping label for return purchase", // 购买退货运单
    "Shipping label for return purchase adjustment", // 退货运单费用调整
    "Shipping label for return purchase covered by plat", // 平台承担的退货运单费用
  ],

  // 退货 .subtotal
  REFUND: ["Refund"],

  // 平台罚款 .total
  PLATFORM_PENALTY: [
    "Delayed fulfillment deduction",
    "Out of stock deduction",
    "Platform reimbursement",
    "Chargeback processing fee",
  ],

  // 广告费用 .total
  ADVERTISING_FEE: "Advertising service fee",
};

module.exports = { TRANSACTION_TYPES };
