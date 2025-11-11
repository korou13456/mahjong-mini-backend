// utils/wechat/templateRegistry.js
const tableSuccessUser = require("./templates/tableSuccessUser");

const TEMPLATE_MAP = {
  TABLE_SUCCES_USER: tableSuccessUser,
  // ... 更多模板注册
};

function getTemplateConfig(type) {
  const config = TEMPLATE_MAP[type];
  if (!config) throw new Error(`未找到模板类型：${type}`);
  return config;
}

module.exports = { getTemplateConfig };
