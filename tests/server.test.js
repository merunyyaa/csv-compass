import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../scripts/serve.js";

test("development server serves the application and keeps private paths inaccessible", async (t) => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const origin = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(origin);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /text\/html/);
  assert.match(await index.text(), /CSV Compass/);
  const module = await fetch(`${origin}/src/main.js`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get("content-type"), /javascript/);
  for (const name of ["sales", "sales-answers", "sales-view"]) {
    const asset = await fetch(`${origin}/src/${name}.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
  }
  const style = await fetch(`${origin}/styles.css`, { method: "HEAD" });
  assert.equal(style.status, 200);
  assert.equal(await style.text(), "");
  for (const path of [
    "/package.json",
    "/.git/config",
    "/tests/csv.test.js",
    "/missing",
    "/%2e%2e/.git/config",
  ]) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal(
    (await fetch(origin, { method: "POST", body: "data" })).status,
    405,
  );
});
