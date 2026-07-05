import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module caches an in-flight load Promise at module scope, so we import it fresh
// per test via a helper that resets modules first.
async function freshModule() {
  vi.resetModules();
  return import('../src/lib/sageCell.js');
}

function presetSagecell(impl) {
  window.sagecell = { makeSagecell: vi.fn(impl) };
  return window.sagecell;
}

describe('sageCell (lazy SageCell loader + editable cell mounting)', () => {
  beforeEach(() => {
    // Clean any injected scripts and preset library between tests.
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    document.body.innerHTML = '';
    delete window.sagecell;
  });

  afterEach(() => {
    delete window.sagecell;
  });

  it('ensureSageCellLoaded() resolves to the preset window.sagecell and injects no scripts', async () => {
    const preset = presetSagecell();
    const { ensureSageCellLoaded } = await freshModule();

    const resolved = await ensureSageCellLoaded();
    expect(resolved).toBe(preset);
    expect(document.querySelectorAll('script[src*=sagecell]').length).toBe(0);
  });

  it('mountEditableCell builds a text/x-sage script with the exact code and calls makeSagecell once', async () => {
    const preset = presetSagecell();
    const { mountEditableCell } = await freshModule();

    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountEditableCell(host, 'print(1+1)');

    const script = host.querySelector('script[type="text/x-sage"]');
    expect(script).not.toBeNull();
    expect(script.text).toBe('print(1+1)');

    expect(preset.makeSagecell).toHaveBeenCalledTimes(1);
    const arg = preset.makeSagecell.mock.calls[0][0];
    expect(arg.evalButtonText).toBe('Run');
    expect(arg.editor).toBe('codemirror');
    expect(arg.autoeval).toBe(false);
    expect(arg.inputLocation).toBe(host.querySelector('.sagecell-mount'));

    expect(host.dataset.sagecellMounted).toBe('true');

    // A second call on the same host must NOT mount again.
    await mountEditableCell(host, 'print(1+1)');
    expect(preset.makeSagecell).toHaveBeenCalledTimes(1);
  });

  it('activatePreauthoredCells mounts each .builtin-applet[data-sage] and returns the count', async () => {
    const preset = presetSagecell();
    const { activatePreauthoredCells } = await freshModule();

    const root = document.createElement('div');
    root.innerHTML = `
      <div class="builtin-applet" data-sage="1+1"></div>
      <div class="builtin-applet" data-sage="2+2"></div>
      <div class="builtin-applet"></div>
    `;
    document.body.appendChild(root);

    const count = activatePreauthoredCells(root);
    expect(count).toBe(2);

    // Let the mount Promises settle, then verify makeSagecell was invoked per mounted cell.
    await Promise.resolve();
    await Promise.resolve();
    expect(preset.makeSagecell).toHaveBeenCalledTimes(2);
  });

  it('mountEditableCell falls back to a read-only <pre> when makeSagecell throws', async () => {
    presetSagecell(() => {
      throw new Error('boom');
    });
    const { mountEditableCell } = await freshModule();

    const host = document.createElement('div');
    document.body.appendChild(host);

    await expect(mountEditableCell(host, 'factor(12)')).resolves.toBeUndefined();

    expect(host.dataset.sagecellMounted).toBeUndefined();
    const pre = host.querySelector('pre.sagecell-fallback');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe('factor(12)');
  });
});
