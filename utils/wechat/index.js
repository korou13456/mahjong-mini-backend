// utils/wechat/index.js
const { sendTemplateMessage } = require("./client");
const { getTemplateConfig } = require("./templateRegistry");

/**
 * 统一推送方法
 * @param {string} type 模板类型（如 TABLE_SUCCESS）
 * @param {string} openid 接收者openid
 * @param {object} payload 构造模板消息所需数据
 * @param {string} [url] 跳转链接
 */
async function pushMessage(
  type,
  openid,
  payload,
  url = "",
  miniprogram = null
) {
  const { templateId, buildData } = getTemplateConfig(type);
  const data = buildData(payload);

  return sendTemplateMessage({
    openid,
    template_id: templateId,
    url,
    data,
    miniprogram,
  });
}

module.exports = { pushMessage };
