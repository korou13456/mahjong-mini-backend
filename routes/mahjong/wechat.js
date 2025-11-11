// routes/mahjong/wechat.js
const {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
} = require("../../utils/wechatVerify");

/**
 * 读取原始文本请求体（兼容未经过 body-parser 的 text/xml）
 */
async function readRawText(req) {
  if (req.rawBody) return req.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  // 没有解析器时，手动读取
  return await new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * 微信服务号服务器配置验证（GET）
 */
async function wechatVerify(req, res) {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = process.env.WECHAT_TOKEN || "";
  if (!token) {
    return res.status(500).send("WECHAT_TOKEN 未配置，无法完成服务器校验");
  }
  const expect = buildSignature(token, timestamp || "", nonce || "");
  if (expect === signature) {
    return res.status(200).send(echostr || "");
  }
  return res.status(401).send("signature 校验失败1");
}

/**
 * 微信服务号消息接收（POST）
 */
async function wechatReceive(req, res) {
  try {
    console.log("服务号消息开始");
    const { timestamp = "", nonce = "", msg_signature = "" } = req.query || {};
    const token = process.env.WECHAT_TOKEN || "";
    const encodingAesKey = process.env.WECHAT_ENCODING_AES_KEY || "";
    const appId = process.env.WX_APP_ID || "";

    const raw = await readRawText(req);
    console.log("[WeChat OA] Incoming query:", req.query);
    console.log("[WeChat OA] Raw body:", raw);

    const encryptMatch =
      raw.match(/<Encrypt><!\[CDATA\[(.*)\]\]><\/Encrypt>/) ||
      raw.match(/<Encrypt>([^<]+)<\/Encrypt>/);
    if (!encryptMatch) {
      console.log("[WeChat OA] Plaintext mode message received");
      return res.status(200).send("success");
    }

    const encrypt = encryptMatch[1] || "";
    if (!token || !encodingAesKey || !appId) {
      return res
        .status(500)
        .send("WECHAT_TOKEN / WECHAT_ENCODING_AES_KEY / WX_APP_ID 未配置");
    }
    const expectMsgSig = buildMsgSignature(token, timestamp, nonce, encrypt);
    if (expectMsgSig !== msg_signature) {
      return res.status(401).send("msg_signature 校验失败");
    }

    const { msg: decryptedXml, appId: xmlAppId } = aesDecrypt(
      encrypt,
      encodingAesKey
    );
    if (xmlAppId !== appId) {
      return res.status(401).send("AppId 不匹配");
    }

    console.log("[WeChat OA] Decrypted XML:", decryptedXml);
    return res.status(200).send("success");
  } catch (err) {
    console.error("[WeChat OA] Error handling message:", err);
    return res.status(200).send("success");
  }
}

module.exports = {
  wechatVerify,
  wechatReceive,
};
