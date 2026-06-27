import http from 'node:http';

const port = Number.parseInt(process.env.DOCSYNC_WEB_PORT ?? '5173', 10);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Docksync Review</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #111827;
      }
      main {
        max-width: 880px;
        margin: 0 auto;
        padding: 48px 24px;
      }
      code {
        background: #e5e7eb;
        border-radius: 4px;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Docksync Review</h1>
      <p>The web review scaffold is running.</p>
      <p>Next milestone: render <code>examples/spec.html</code> in a sandboxed iframe.</p>
    </main>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url?.startsWith('/r/')) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    res.end(html);
    return;
  }

  res.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8'
  });
  res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Docksync Web listening on http://localhost:${port}`);
});
