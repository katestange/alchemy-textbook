import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The module caches an in-flight load Promise at module scope, so we import it fresh
// per test via a helper that resets modules first.
async function freshModule() {
  vi.resetModules();
  return import('../src/lib/desmos.js');
}

function presetDesmos() {
  window.Desmos = {
    GraphingCalculator: vi.fn(() => ({ setExpression: vi.fn() }))
  };
  return window.Desmos;
}

describe('desmos (lazy Desmos loader + interactive graph mounting)', () => {
  beforeEach(() => {
    // Clean any injected scripts and preset library between tests.
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    document.body.innerHTML = '';
    delete window.Desmos;
  });

  afterEach(() => {
    delete window.Desmos;
  });

  it('ensureDesmosLoaded() resolves to the preset window.Desmos and injects no scripts', async () => {
    const preset = presetDesmos();
    const { ensureDesmosLoaded } = await freshModule();

    const resolved = await ensureDesmosLoaded();
    expect(resolved).toBe(preset);
    expect(document.querySelectorAll('script[src*=desmos]').length).toBe(0);
  });

  it('parseExpressions splits, trims, and drops empty/comment lines', async () => {
    const { parseExpressions } = await freshModule();
    expect(parseExpressions('y=x^2\n\n# a comment\n  x=1 ')).toEqual([
      'y=x^2',
      'x=1'
    ]);
  });

  it('mountDesmosCalculator creates the calculator once and adds each expression', async () => {
    const preset = presetDesmos();
    const { mountDesmosCalculator } = await freshModule();

    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountDesmosCalculator(host, ['y=x^2', 'x=1']);

    const graph = host.querySelector('.desmos-graph');
    expect(graph).not.toBeNull();
    expect(preset.GraphingCalculator).toHaveBeenCalledTimes(1);
    expect(preset.GraphingCalculator.mock.calls[0][0]).toBe(graph);

    const calc = preset.GraphingCalculator.mock.results[0].value;
    expect(calc.setExpression).toHaveBeenCalledTimes(2);
    expect(calc.setExpression).toHaveBeenNthCalledWith(1, { id: 'e0', latex: 'y=x^2' });
    expect(calc.setExpression).toHaveBeenNthCalledWith(2, { id: 'e1', latex: 'x=1' });

    expect(host.dataset.desmosMounted).toBe('true');

    // A second call on the same host must NOT mount again.
    await mountDesmosCalculator(host, ['y=x^2', 'x=1']);
    expect(preset.GraphingCalculator).toHaveBeenCalledTimes(1);
  });

  it('mountDesmosCalculator accepts a newline-delimited string (parses then mounts)', async () => {
    const preset = presetDesmos();
    const { mountDesmosCalculator } = await freshModule();

    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountDesmosCalculator(host, 'y=x\n(1,2)');

    expect(preset.GraphingCalculator).toHaveBeenCalledTimes(1);
    const calc = preset.GraphingCalculator.mock.results[0].value;
    expect(calc.setExpression).toHaveBeenCalledTimes(2);
    expect(calc.setExpression).toHaveBeenNthCalledWith(1, { id: 'e0', latex: 'y=x' });
    expect(calc.setExpression).toHaveBeenNthCalledWith(2, { id: 'e1', latex: '(1,2)' });
    expect(host.dataset.desmosMounted).toBe('true');
  });

  it('mountDesmosCalculator falls back to a read-only <pre> when GraphingCalculator throws', async () => {
    presetDesmos();
    window.Desmos.GraphingCalculator = vi.fn(() => {
      throw new Error('boom');
    });
    const { mountDesmosCalculator } = await freshModule();

    const host = document.createElement('div');
    document.body.appendChild(host);

    await expect(
      mountDesmosCalculator(host, ['y=x^2', 'x=1'])
    ).resolves.toBeUndefined();

    expect(host.dataset.desmosMounted).toBeUndefined();
    const pre = host.querySelector('pre.desmos-fallback');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe('y=x^2\nx=1');
  });
});
