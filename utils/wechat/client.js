// utils/wechat/client.js
const axios = require("axios");

const APP_ID = process.env.WX_APP_ID;
const APP_SECRET = process.env.WX_APP_SECRET;

let cachedToken = "";
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime) return cachedToken;

  console.log(APP_ID, "!=====>APP_ID");
  console.log(APP_SECRET, "!=====>>APP_SECRET");
  const res = await axios.get("https://api.weixin.qq.com/cgi-bin/token", {
    params: {
      grant_type: "client_credential",
      appid: APP_ID,
      secret: APP_SECRET,
    },
  });
  if (!res.data.access_token) {
    throw new Error("获取微信 access_token 失败：" + JSON.stringify(res.data));
  }

  cachedToken = res.data.access_token;
  tokenExpireTime = now + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

async function sendTemplateMessage({
  openid,
  template_id,
  url = "",
  data,
  miniprogram = null,
}) {
  const token = await getAccessToken();

  const payload = {
    touser: openid,
    template_id,
    data,
  };

  if (miniprogram) {
    payload.miniprogram = miniprogram;
  }

  if (url) {
    payload.url = url;
  }

  const res = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`,
    payload
  );

  if (res.data.errcode !== 0) {
    console.error("推送失败:", res.data);
  } else {
    console.log(`推送成功 to ${openid}`);
  }

  return res.data;
}

module.exports = { getAccessToken, sendTemplateMessage };
