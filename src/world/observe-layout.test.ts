import {afterEach, describe, expect, it, vi} from 'vitest';
import {observeLayout} from './observe-layout';

afterEach(() => vi.unstubAllGlobals());
describe('layout observer scheduling', () => {
  function setup() {
    let notify = () => {}, frame = () => {};
    const cancel = vi.fn(), disconnect = vi.fn(), request = vi.fn((callback: () => void) => {frame = callback; return 1;});
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) {notify = callback;}
      observe() {}
      disconnect = disconnect;
    });
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    return {notify: () => notify(), flush: () => frame(), request, cancel, disconnect};
  }
  it('coalesces notifications and runs the size update in the next frame', () => {
    const clock = setup(), resize = vi.fn(), stop = observeLayout({} as Element, resize);
    clock.notify(); clock.notify();
    expect(resize).not.toHaveBeenCalled(); expect(clock.request).toHaveBeenCalledTimes(1);
    clock.flush(); expect(resize).toHaveBeenCalledTimes(1);
    clock.notify(); clock.flush(); expect(resize).toHaveBeenCalledTimes(2);
    stop();
  });
  it('cancels the pending frame when a scene closes', () => {
    const clock = setup(), resize = vi.fn(), stop = observeLayout({} as Element, resize);
    clock.notify(); stop(); clock.flush(); clock.notify();
    expect(clock.cancel).toHaveBeenCalledWith(1); expect(clock.disconnect).toHaveBeenCalledOnce();
    expect(resize).not.toHaveBeenCalled(); expect(clock.request).toHaveBeenCalledTimes(1);
  });
});
