// Tiny static server for the Stage 2 gate demo (STY-111). No dependencies: just serves
// demo/page.html for every request, on whatever port PORT names (80 by default, so the
// address bar can show a plain http://<name>/ with no port). See demo/README.md.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PAGE_PATH = fileURLToPath(new URL("./page.html", import.meta.url));
const PORT = Number(process.env.PORT ?? 80);

const server = createServer(async (_req, res) => {
  const page = await readFile(PAGE_PATH);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
});

server.on("error", (err) => {
  if (err.code === "EACCES") {
    console.error(
      `Port ${PORT} needs an elevated terminal (Administrator on Windows, sudo on ` +
        `Mac/Linux). See demo/README.md for the no-elevation option: PORT=8080.`,
    );
  } else {
    console.error(err.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`Demo page serving on http://127.0.0.1:${PORT}/ — see demo/README.md`);
});
