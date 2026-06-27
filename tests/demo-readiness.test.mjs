import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(path, 'utf8');
}

describe('demo readiness docs and samples', () => {
  it('documents the clean checkout quickstart in English', async () => {
    const quickstart = await text('docs/demo-quickstart.md');

    assert.match(quickstart, /npm install/);
    assert.match(quickstart, /npm run dev/);
    assert.match(quickstart, /\.\/docsync push examples\/spec\.html --server http:\/\/127\.0\.0\.1:8787/);
    assert.match(quickstart, /\.\/docsync pull/);
    assert.match(quickstart, /\.\/docsync context --open-comments/);
    assert.match(quickstart, /Slide preparation is out of scope/);
  });

  it('keeps a slide-free demo script for the full MVP loop', async () => {
    const script = await text('docs/demo-script.md');

    assert.match(script, /push -> browser comment -> pull -> context -> edit -> push v2 -> rebase/);
    assert.match(script, /Refresh comments/);
    assert.match(script, /selector, text quote, heading path, comment body, and suggested instruction/);
    assert.match(script, /data-docsync-id="anchor-rebase"/);
  });

  it('keeps demo fixtures for stable targets and manual security rejection', async () => {
    const [spec, unsafe] = await Promise.all([
      text('examples/spec.html'),
      text('examples/unsafe-script.html')
    ]);

    assert.match(spec, /data-docsync-id="hero-title"/);
    assert.match(spec, /data-docsync-id="workflow"/);
    assert.match(spec, /data-docsync-id="anchor-rebase"/);
    assert.match(spec, /For the orphan demo/);
    assert.match(unsafe, /<script>alert/);
  });
});
