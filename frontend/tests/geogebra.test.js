import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The load Promise is cached at module scope, so we reset modules between tests and
// dynamically import a fresh copy each time.
let evalCommand;

async function freshModule() {
  vi.resetModules();
  return import('../src/lib/geogebra.js');
}

beforeEach(() => {
  evalCommand = vi.fn();
  window.GGBApplet = vi.fn(function (params) {
    this._params = params;
    this.inject = () => {
      params.appletOnLoad && params.appletOnLoad({ evalCommand });
    };
  });
});

afterEach(() => {
  delete window.GGBApplet;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('ensureGeoGebraLoaded', () => {
  it('resolves to the preset constructor and injects no script', async () => {
    const { ensureGeoGebraLoaded } = await freshModule();
    const ctor = await ensureGeoGebraLoaded();
    expect(ctor).toBe(window.GGBApplet);
    expect(document.querySelectorAll('script[src*=geogebra]').length).toBe(0);
  });
});

describe('parseCommands', () => {
  it('trims lines and drops empty and comment lines', async () => {
    const { parseCommands } = await freshModule();
    expect(parseCommands('c: y^2=x^3\n\n# note\n  A=(0,1) ')).toEqual([
      'c: y^2=x^3',
      'A=(0,1)'
    ]);
  });
});

describe('mountGeoGebra', () => {
  it('constructs the applet once, injects, runs each command, and sets the flag', async () => {
    const { mountGeoGebra } = await freshModule();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const cmds = ['c: y^2=x^3-3x+3', 'A=Point(c)'];
    await mountGeoGebra(host, cmds);

    expect(window.GGBApplet).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(2);
    expect(evalCommand).toHaveBeenNthCalledWith(1, 'c: y^2=x^3-3x+3');
    expect(evalCommand).toHaveBeenNthCalledWith(2, 'A=Point(c)');
    expect(host.dataset.ggbMounted).toBe('true');

    // second call is a no-op
    await mountGeoGebra(host, cmds);
    expect(window.GGBApplet).toHaveBeenCalledTimes(1);
  });

  it('parses a newline-delimited string then mounts', async () => {
    const { mountGeoGebra } = await freshModule();
    const host = document.createElement('div');
    document.body.appendChild(host);

    await mountGeoGebra(host, 'A=(1,2)\nB=(3,4)');

    expect(window.GGBApplet).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(2);
    expect(evalCommand).toHaveBeenNthCalledWith(1, 'A=(1,2)');
    expect(evalCommand).toHaveBeenNthCalledWith(2, 'B=(3,4)');
    expect(host.dataset.ggbMounted).toBe('true');
  });

  it('falls back to a <pre> when the constructor throws and leaves the flag unset', async () => {
    window.GGBApplet = vi.fn(function () {
      throw new Error('boom');
    });
    const { mountGeoGebra } = await freshModule();
    const host = document.createElement('div');
    document.body.appendChild(host);

    await expect(mountGeoGebra(host, ['A=(1,2)'])).resolves.toBeUndefined();
    expect(host.dataset.ggbMounted).toBeUndefined();
    const pre = host.querySelector('pre.geogebra-fallback');
    expect(pre).not.toBeNull();
    expect(pre.textContent).toBe('A=(1,2)');
  });
});
