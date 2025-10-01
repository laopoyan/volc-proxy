import express from "express";
import crypto from "crypto";
import { SignerV4 } from "@volcengine/openapi";

// 修复：运行时版本与Vercel配置统一为nodejs20.x
export const config = { runtime: 'nodejs20.x' };

const app = express();

/** 即梦4.0 API配置 */
const HOST = "api.jimeng.ai";
const REGION = "cn-north-1";
const SERVICE = "jimeng";
const PATHNAME = "/v1/images/generations";
const ACTION = "GenerateImage";
const VERSION = "2024-01-01";

/** 中间件配置 */
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Date,X-Content-Sha256");
  req.method === "OPTIONS" ? res.sendStatus(200) : next();
});
app.disable("x-powered-by");

/** 健康检查路由 */
app.get("/", (_req, res) => res.send("即梦4.0 API代理服务运行中"));
app.get("/api", (_req, res) => res.send("OK"));

/** 签名与转发核心函数 */
async function signAndForward(bodyObj = {}) {
  const accessKeyId = process.env.VOLC_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLC_SECRET_ACCESS_KEY;
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("环境变量 VOLC_ACCESS_KEY_ID 或 VOLC_SECRET_ACCESS_KEY 未设置");
  }

  const body = JSON.stringify(bodyObj);
  const xContentSha256 = crypto.createHash("sha256").update(body).digest("hex");
  
  const request = {
    region: REGION,
    method: "POST",
    pathname: PATHNAME,
    query: { Action: ACTION, Version: VERSION },
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Sha256": xContentSha256
    },
    body
  };

  const signer = new SignerV4(request, SERVICE);
  signer.addAuthorization({ accessKeyId, secretKey: secretAccessKey });

  const url = `https://${HOST}${PATHNAME}?${new URLSearchParams(request.query).toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: request.headers,
      body,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    // 新增：检查API响应状态码
    if (!resp.ok) {
      throw new Error(`API请求失败: ${resp.status} ${resp.statusText}\n响应内容: ${await resp.text()}`);
    }

    return { status: resp.status, text: await resp.text() };
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/** 文生图任务提交路由 */
app.post("/api/visual-submit", async (req, res) => {
  try {
    const { status, text } = await signAndForward(req.body);
    res.status(status).send(text);
  } catch (e) {
    console.error("提交任务错误:", e);
    res.status(500).json({ 
      message: "代理服务错误", 
      error: String(e),
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined
    });
  }
});

/** 兜底路由 */
app.use((_req, res) => res.status(404).json({ message: "接口不存在" }));

/** Vercel处理函数导出 */
export default function handler(req, res) {
  return app(req, res);
}
