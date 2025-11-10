const crypto = require("crypto");

function getHeader(req, name) {
  const key = name.toLowerCase();
  return (
    req.headers[key] ||
    req.headers[key.replace(/_/g, "-")] ||
    req.headers[key.replace(/-/g, "_")]
  );
}

function base64HmacSha256(keyBuf, message) {
  const hmac = crypto.createHmac("sha256", keyBuf);
  hmac.update(message);
  return hmac.digest("base64");
}

function tryJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * WeChat API Security middleware
 * - Verifies signature with symmetric key
 * - Optionally decrypts AES-256-GCM payload
 * Active only in production and when required headers are present.
 */
module.exports = function wechatApiSecurity() {
  const isProd = process.env.NODE_ENV === "production";
  const symmetricKeyB64 = process.env.WECHAT_SYMMETRIC_KEY || "";
  const platformCertNo = process.env.WECHAT_OPEN_PLATFORM_CERT_NO || "";

  // No-op if not configured or not production
  if (!isProd || !symmetricKeyB64) {
    return (req, res, next) => next();
  }

  const keyBuf = Buffer.from(symmetricKeyB64, "base64");

  return (req, res, next) => {
    const timestamp = getHeader(req, "x-wx-timestamp");
    const nonce = getHeader(req, "x-wx-nonce");
    const signature = getHeader(req, "x-wx-signature");
    const serial = getHeader(req, "x-wx-serial");
    const encryptAlg = getHeader(req, "x-wx-encrypt"); // e.g. AES-256-GCM

    // If headers not present, skip (non-WeChat requests)
    if (!timestamp || !nonce || !signature) {
      return next();
    }

    // Optional: check certificate serial if provided
    if (platformCertNo && serial && serial !== platformCertNo) {
      return res
        .status(401)
        .json({ code: 401, message: "WeChat serial mismatch" });
    }

    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const signPayload = `${timestamp}\n${nonce}\n${raw}\n`;
    const expected = base64HmacSha256(keyBuf, signPayload);
    if (expected !== signature) {
      return res
        .status(401)
        .json({ code: 401, message: "WeChat signature verification failed" });
    }

    // If no encryption declared, pass through
    if (!encryptAlg) {
      return next();
    }

    // Decrypt AES-256-GCM payload
    try {
      // Support two formats:
      // 1) raw body is base64 ciphertext
      // 2) JSON body { ciphertext: base64, iv: base64, tag?: base64 }
      let ciphertextB64 = raw;
      let ivB64 = getHeader(req, "x-wx-iv") || "";
      let tagB64 = getHeader(req, "x-wx-tag") || "";

      const parsed = tryJsonParse(raw);
      if (parsed && parsed.ciphertext) {
        ciphertextB64 = parsed.ciphertext;
        ivB64 = parsed.iv || ivB64;
        tagB64 = parsed.tag || tagB64;
      }

      const iv = Buffer.from(ivB64, "base64");
      const ciphertext = Buffer.from(ciphertextB64, "base64");
      const tag = tagB64 ? Buffer.from(tagB64, "base64") : null;

      const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
      // Bind AAD to strengthen binding between headers and body
      const aad = Buffer.from(`${timestamp}\n${nonce}\n`, "utf8");
      decipher.setAAD(aad);
      if (tag) decipher.setAuthTag(tag);
      let plaintext = decipher.update(ciphertext, undefined, "utf8");
      plaintext += decipher.final("utf8");

      const json = tryJsonParse(plaintext);
      if (json) {
        req.body = json;
      } else {
        req.body = { plaintext };
      }
      return next();
    } catch (err) {
      return res
        .status(400)
        .json({ code: 400, message: "WeChat payload decrypt failed" });
    }
  };
};
