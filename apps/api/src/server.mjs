import { serve } from '@hono/node-server';
import { createApp } from './app.mjs';
import { createJsonFileStorage } from './storage.mjs';

const port = Number.parseInt(process.env.DOCSYNC_API_PORT ?? '8787', 10);
const hostname = process.env.DOCSYNC_API_HOST ?? '127.0.0.1';
const storageFile = process.env.DOCSYNC_STORAGE_FILE ?? '.docsync/api-storage.json';
const app = createApp({
  storage: createJsonFileStorage({
    filePath: storageFile
  })
});

serve(
  {
    fetch: app.fetch,
    port,
    hostname
  },
  (info) => {
    console.log(`Docksync API listening on http://${hostname}:${info.port}`);
    console.log(`Docksync API storage: ${storageFile}`);
  }
);
