import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

describe('scaffold', () => {
  it('prints English CLI help', () => {
    const result = spawnSync(process.execPath, ['packages/cli/bin/docsync.mjs', '--help'], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Docksync CLI/);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /push <file\.html>/);
  });

  it('includes a shared HTML fixture', async () => {
    const html = await readFile('examples/spec.html', 'utf8');

    assert.match(html, /<!doctype html>/i);
    assert.match(html, /data-docsync-id="hero-title"/);
    assert.match(html, /Docksync/);
  });
});
