import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";

const { app, attachRealtime, ready } = createApp();
const http = createServer(app);
attachRealtime(http);

ready.then(() => {
  http.listen(config.port, () => {
    console.log(`[api] GoBareng API listening on :${config.port} (${config.nodeEnv})`);
  });
});
