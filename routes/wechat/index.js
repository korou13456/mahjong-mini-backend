const express = require("express");
const router = express.Router();
const {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
} = require("../../utils/wechatVerify");
const db = require("../../config/database");

// 确保表存在（轻量保护）
async function ensureTable() {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS wechat_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      msg_id BIGINT UNSIGNED NULL,
      to_user_name VARCHAR(64) NOT NULL,
      from_user_name VARCHAR(64) NOT NULL,
      msg_type VARCHAR(32) NOT NULL,
      event VARCHAR(64) NULL,
      event_key VARCHAR(128) NULL,
      content TEXT NULL,
      media_id VARCHAR(128) NULL,
      pic_url VARCHAR(512) NULL,
      url VARCHAR(512) NULL,
      create_time INT UNSIGNED NOT NULL,
      signature VARCHAR(128) NULL,
      timestamp VARCHAR(32) NULL,
      nonce VARCHAR(64) NULL,
      encrypt_alg VARCHAR(32) NULL,
      raw_payload MEDIUMTEXT NULL,
      status TINYINT NOT NULL DEFAULT 0,
      error_msg VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_msgid (msg_id),
      KEY idx_from_time (from_user_name, create_time),
      KEY idx_type_time (msg_type, create_time),
      KEY idx_event_time (event, create_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

ensureTable().catch(() => {});

function tryParseXmlField(xml, tag) {
  const reCdata = new RegExp(`<${tag}><!\\[CDATA\\[(.+?)\\]\\]><\\/${tag}>`, "i");
  const rePlain = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, "i");
  const m = xml.match(reCdata) || xml.match(rePlain);
  return m ? m[1].trim() : null;
}

function extractMessage(plaintext) {
  // 尝试 JSON
  try {
    const j = JSON.parse(plaintext);
    return {
      toUserName: j.ToUserName || "",
      fromUserName: j.FromUserName || "",
      msgType: j.MsgType || "",
      event: j.Event || null,
      eventKey: j.EventKey || null,
      content: j.Content || null,
      mediaId: j.MediaId || null,
      picUrl: j.PicUrl || null,
      url: j.Url || null,
      msgId: j.MsgId || null,
      createTime: j.CreateTime || Math.floor(Date.now() / 1000),
    };
  } catch (_) {
    // XML 粗解析
    const toUserName = tryParseXmlField(plaintext, "ToUserName") || "";
    const fromUserName = tryParseXmlField(plaintext, "FromUserName") || "";
    const msgType = tryParseXmlField(plaintext, "MsgType") || "";
    const event = tryParseXmlField(plaintext, "Event");
    const eventKey = tryParseXmlField(plaintext, "EventKey");
    const content = tryParseXmlField(plaintext, "Content");
    const mediaId = tryParseXmlField(plaintext, "MediaId");
    const picUrl = tryParseXmlField(plaintext, "PicUrl");
    const url = tryParseXmlField(plaintext, "Url");
    const msgIdStr = tryParseXmlField(plaintext, "MsgId");
    const createTimeStr = tryParseXmlField(plaintext, "CreateTime");
    return {
      toUserName,
      fromUserName,
      msgType,
      event,
      eventKey,
      content,
      mediaId,
      picUrl,
      url,
      msgId: msgIdStr ? Number(msgIdStr) : null,
      createTime: createTimeStr ? Number(createTimeStr) : Math.floor(Date.now() / 1000),
    };
  }
}

// GET /wechat - 微信服务器URL校验
router.get("/", (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = process.env.WECHAT_TOKEN;
  if (!signature || !timestamp || !nonce || !echostr || !token) {
    return res.status(400).send("bad request");
  }
  const expect = buildSignature(token, timestamp, nonce);
  if (expect === signature) {
    return res.send(echostr);
  }
  return res.status(401).send("invalid signature");
});

// POST /wechat - 微信消息推送（支持 JSON/XML，安全模式）
router.post("/", (req, res) => {
  const token = process.env.WECHAT_TOKEN;
  const encodingAesKey = process.env.WECHAT_ENCODING_AES_KEY;
  if (!token || !encodingAesKey) {
    return res.status(500).send("server misconfigured");
  }

  const { timestamp, nonce, msg_signature } = req.query || {};
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const isXml = contentType.includes("xml");

  let encrypt = "";
  if (isXml) {
    // WeChat XML: <xml><Encrypt><![CDATA[...]]></Encrypt></xml>
    const raw = (req.rawBody || Buffer.from("")).toString("utf8");
    const match =
      raw.match(/<Encrypt><!\[CDATA\[(.+?)\]\]><\/Encrypt>/i) ||
      raw.match(/<Encrypt>([^<]+)<\/Encrypt>/i);
    if (match) {
      encrypt = match[1].trim();
    }
  } else {
    const body = req.body || {};
    encrypt = body.Encrypt || body.encrypt || "";
  }

  if (!timestamp || !nonce || !msg_signature || !encrypt) {
    return res.status(400).send("bad request");
  }

  const expect = buildMsgSignature(token, timestamp, nonce, encrypt);
  if (expect !== msg_signature) {
    return res.status(401).send("invalid msg_signature");
  }

  try {
    const { msg } = aesDecrypt(encrypt, encodingAesKey);
    // 入库
    const m = extractMessage(msg || "");
    await db.execute(
      `INSERT INTO wechat_messages
        (msg_id, to_user_name, from_user_name, msg_type, event, event_key, content, media_id, pic_url, url, create_time, signature, timestamp, nonce, encrypt_alg, raw_payload, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [
        m.msgId,
        m.toUserName,
        m.fromUserName,
        m.msgType,
        m.event,
        m.eventKey,
        m.content,
        m.mediaId,
        m.picUrl,
        m.url,
        m.createTime,
        req.query?.msg_signature || null,
        String(timestamp || ""),
        String(nonce || ""),
        "AES-256-CBC",
        msg,
      ]
    );
    return res.send("success");
  } catch (e) {
    return res.status(400).send("decrypt failed");
  }
});

module.exports = router;
