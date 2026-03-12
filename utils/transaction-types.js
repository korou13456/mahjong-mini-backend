// 交易类型配置
const TRANSACTION_TYPES = {
  // 用户支付 .subtotal
  USER_PAYMENT: ["Order Payment"],

  // 平台物流补贴  .shipping
  PLATFORM_SHIPPING: ["Order Payment", "Refund"],

  // 物流费用 .total
  SHIPPING_COST: [
    "Shipping label purchase",
    "Shipping label purchase adjustment",
    "Shipping label for return purchase adjustment",
    "Shipping label for return purchase",
    "Shipping label for return purchase covered by plat",
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
