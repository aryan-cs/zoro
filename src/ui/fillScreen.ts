/**
 * Opened from the Home Screen, iOS 26 and later can give the app a viewport shorter than the
 * screen by the status bar's height (WebKit bug 301108, with a see-through status bar), leaving a
 * black band under the tab bar. When the viewport comes up short like that, size the app to the
 * screen itself (html.fill-screen, see index.css). It's measured, so a phone without the bug, a
 * browser tab, or the keyboard opening changes nothing.
 */
export function fillScreen(): void {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!standalone) return;
  const root = document.documentElement;
  const fit = () => {
    const portrait = innerHeight >= innerWidth;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const gap = full - innerHeight;
    // About a status bar's worth (it's 47–62pt on current iPhones); anything else isn't this bug.
    const short = gap >= 20 && gap <= 100;
    root.classList.toggle('fill-screen', short);
    if (short) root.style.setProperty('--screen-h', `${full}px`);
  };
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', fit);
}
