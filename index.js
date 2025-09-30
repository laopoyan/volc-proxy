import express from "express";
import crypto from "crypto";
import { Signer } from "@volcengine/openapi";

const app = express();

// 🔒 固定服务信息（即梦视觉）
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";

app.use(express.json());

// (可选) 允许跨域，便于本地或前端直接调
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// 健康检查
app.get("/", (_req, res) => {
  res.send("volc-proxy is running. Use POST /api/visual-submit or /api/visual-result");
});

// 公共：签名并转发
async function signAndForward(action, bodyObj) {
  const body = JSON.stringify(bodyObj || {});
  const xContentSha256 = crypto.createHash("sha256").update(body).digest("hex");

  // 供签名使用的请求对象
  const request = {
    region: REGION,
    method: "POST",
    pathname: "/",
    headers: {
      Host: HOST,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Sha256": xContentSha256
    },
    body
  };

  // 生成 Authorization / X-Date
  const signer = new Signer(request, SERVICE);
  signer.addAuthorization({
    accessKeyId: process.env.VOLC_ACCESS_KEY_ID,
    secretKey: process.env.VOLC_SECRET_ACCESS_KEY
  });

  // 带 Action & Version
  const url = `https://${HOST}/?Action=${action}&Version=${VERSION}`;
  return fetch(url, { method: "POST", headers: request.headers, body });
}

/**
 * 提交任务
 * Body 示例：
 * { "req_key":"jimeng_t2i_v40", "prompt":"a cute cat", "image_urls":["https://.../ref.png"] }
 */
app.post("/api/visual-submit", async (req, res) => {
  try {
    const r = await signAndForward("CVSync2AsyncSubmitTask", req.body);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ message: "proxy error", error: String(e) });
  }
});

/**
 * 查询结果
 * Body 示例：
 * { "task_id":"xxxx" }
 */
app.post("/api/visual-result", async (req, res) => {
  try {
    const r = await signAndForward("CVSync2AsyncGetResult", req.body);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e) {
    res.status(500).json({ message: "proxy error", error: String(e) });
  }
});

// ⚠️ 在 Vercel 上不要 app.listen；直接导出 app 即可
export default app;
