import http from 'node:http';

const port = Number.parseInt(process.env.DOCSYNC_API_PORT ?? '8787', 10);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    sendJson(res, 200, {
      service: 'docsync-api',
      status: 'ok'
    });
    return;
  }

  sendJson(res, 404, {
    error: 'Not found',
    message: 'Docksync API scaffold is running.'
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Docksync API listening on http://localhost:${port}`);
});
