/**
 * Temporary: shows the viewport numbers on screen, only when opened from a test link carrying
 * ?preview= (the icon previews in the Simulator), to pin down iOS's short Home Screen viewport.
 */
export function viewportProbe(): void {
  if (!location.search.includes('preview=')) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;top:120px;z-index:99999;background:rgba(255,0,0,.85);color:#fff;font:12px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:8px;white-space:pre;pointer-events:none';
  const probe = (h: string) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;visibility:hidden;width:1px;height:${h}`;
    document.documentElement.appendChild(d);
    const v = Math.round(d.getBoundingClientRect().height);
    d.remove();
    return v;
  };
  const show = () => {
    const k = document.querySelector('.k-app')?.getBoundingClientRect();
    const nav = navigator as Navigator & { standalone?: boolean };
    box.textContent = [
      `build ${__BUILD__}`,
      `inner ${innerWidth}x${innerHeight}  screen ${screen.width}x${screen.height}`,
      `vv ${Math.round(visualViewport?.height ?? -1)} docH ${document.documentElement.clientHeight}`,
      `body ${Math.round(document.body.getBoundingClientRect().height)} kapp ${Math.round(k?.height ?? -1)}`,
      `vh ${probe('100vh')} lvh ${probe('100lvh')} svh ${probe('100svh')} dvh ${probe('100dvh')}`,
      `safeTop ${probe('env(safe-area-inset-top)')} safeBot ${probe('env(safe-area-inset-bottom)')}`,
      `standalone ${nav.standalone} dm ${matchMedia('(display-mode: standalone)').matches} fill ${document.documentElement.classList.contains('fill-screen')}`,
    ].join('\n');
  };
  const start = () => {
    document.body.appendChild(box);
    show();
    setInterval(show, 1000);
  };
  if (document.body) start();
  else addEventListener('DOMContentLoaded', start);
}
