import { Sym } from './Sym';
import type { SFName } from './sf';
import './desktop.css';

/** A phone or tablet. iPadOS says it's a Mac, but it has a touch screen. */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const Step = ({ icon, color, children }: { icon: SFName; color: string; children: React.ReactNode }) => (
  <li className="dn-row">
    <span className="dn-tile" style={{ background: color }}>
      <Sym name={icon} size={16} />
    </span>
    <span className="dn-text">{children}</span>
  </li>
);

/** Shown instead of the app on a computer: Zoro is made to live on an iPhone's Home Screen. */
export function DesktopNotice() {
  const address = `${location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '');
  return (
    <main className="dn">
      <img className="dn-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" />
      <h1 className="dn-title">This app is intended for mobile devices.</h1>
      <p className="dn-sub">Add Zoro to your iPhone’s Home Screen and it opens full screen, like any other app.</p>
      <ol className="dn-list">
        <Step icon="iphone" color="#34c759">
          On your iPhone, open <b>{address}</b> in Safari.
        </Step>
        <Step icon="square.and.arrow.up" color="#0a84ff">
          Tap <b>Share</b>. If you don’t see it, it’s in the <b>•••</b> menu.
        </Step>
        <Step icon="plus.square" color="#636366">
          Tap <b>Add to Home Screen</b>, then <b>Add</b>.
        </Step>
      </ol>
      <p className="dn-foot">Then open Zoro from your Home Screen.</p>
    </main>
  );
}
