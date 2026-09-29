import { createApp } from "./app";
import { env } from "./env";

const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on :${env.port} (webOrigin=${env.webOrigin})`);
});
