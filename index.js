const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use(express.json());

app.all("*", async (req, res) => {
  try {
    // 转发到火山引擎 API
    const targetUrl = "https://visual.volcengineapi.com" + req.url;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": req.headers["authorization"] || ""
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
