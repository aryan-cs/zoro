import './desktop.css';

/** A phone or tablet. iPadOS says it's a Mac, but it has a touch screen. */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Shown instead of the app on a computer. */
export function DesktopNotice() {
  return (
    <main className="dn">
      <img className="dn-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="Zoro" />
      <p className="dn-text">
        This app is intended for mobile devices.
        <br />
        Please add this app to your home screen via the share menu.
      </p>
    </main>
  );
}
