export const config = { runtime: 'nodejs22.x' };
// api/index.js
import express from "express";
import crypto from "crypto";
import { Signer } from "@volcengine/openapi";

const app = express();

/** 即梦视觉固定参数 */
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";

/** 解析 JSON + 简单限流 */
app.use(express.json({ limit: "2mb" }));

/** 允许跨域（便于本地/前端调试，可按需删除） */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/** 健康检查 */
app.get("/", (_req, res) => {
  res.send("volc-proxy is running. Use POST /api/visual-submit or /api/visual-result");
});
app.get("/api", (_req, res) => {
  res.send("OK");
});

/** 核心：签名并转发到火山引擎 */
async function signAndForward(action, bodyObj = {}) {
  const accessKeyId = process.env.VOLC_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLC_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing VOLC_ACCESS_KEY_ID or VOLC_SECRET_ACCESS_KEY envs");
  }

  const body = JSON.stringify(bodyObj);
  const xContentSha256 = crypto.createHash("sha256").update(body).digest("hex");

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

  const signer = new Signer(request, SERVICE);
  signer.addAuthorization({
    accessKeyId,
    secretKey: secretAccessKey
  });

  const url = `https://${HOST}/?Action=${encodeURIComponent(action)}&Version=${VERSION}`;
  const resp = await fetch(url, { method: "POST", headers: request.headers, body });
  const text = await resp.text();
  return { status: resp.status, text };
}

/** 提交任务 */
app.post("/api/visual-submit", async (req, res) => {
  try {
    const { status, text } = await signAndForward("CVSync2AsyncSubmitTask", req.body);
    res.status(status).send(text);
  } catch (e) {
    res.status(500).json({ message: "proxy error", error: String(e) });
  }
});

/** 查询结果 */
app.post("/api/visual-result", async (req, res) => {
  try {
    const { status, text } = await signAndForward("CVSync2AsyncGetResult", req.body);
    res.status(status).send(text);
  } catch (e) {
    res.status(500).json({ message: "proxy error", error: String(e) });
  }
});

/** 兜底路由（可选） */
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

/** Vercel 导出处理函数 */
export default function handler(req, res) {
  return app(req, res);
}
