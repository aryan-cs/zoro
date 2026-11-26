import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { saveSettings } from '../core/db';
import { useSettings } from './kit';
import { MaskSym } from './Sym';
import { SMOOTH, SPRING_TOKENS, springEasing, type Spring } from './motion';

/**
 * The boxes on a page (History's cards) can be rearranged like Home Screen apps: touch and hold
 * one and, as in iOS, the page blurs behind it with a menu to pin it to the top or hide it.
 * Pinning slides it up (a small pin marks it); hiding fades it away and the boxes below slide up
 * into its place. "Show Hidden Items" at the bottom of the page brings hidden ones back. The
 * choices are saved in Settings (so they're backed up), per page.
 */

export function Box(props: { id: string; children: ReactNode }) {
  return <>{props.children}</>;
}

/** Touch and hold this long to open a box's menu (iOS's context menus take about half a second). */
const HOLD_MS = 500;
/** Holds that start on these do their own thing (a stat explains itself, a chart scrubs, a control works). */
const OWN_HOLD = '[data-info], .fit-chart, button, a, input, textarea, select, .ios-segmented, [role="button"]';
/** How boxes slide to new places, and come and go: Apple's springs (ui/motion.ts). */
const timing = (s: Spring) => {
  const { ms, easing } = springEasing(s);
  return { duration: ms, easing };
};
const SLIDE = timing(SMOOTH);
const APPEAR = timing(SMOOTH);
const VANISH = timing(SPRING_TOKENS.quick);

/** Asks a page's boxes to note where they are, just before something changes their order. */
const CAPTURE = 'zoro:boxes-capture';

function useBoxState(page: string) {
  const settings = useSettings();
  const state = settings.boxes?.[page] ?? { pinned: [], hidden: [] };
  const save = (pinned: string[], hidden: string[]) => void saveSettings({ boxes: { ...settings.boxes, [page]: { pinned, hidden } } });
  return { state, save };
}

export function Boxes({ page, children }: { page: string; children: ReactNode }) {
  const { state, save } = useBoxState(page);
  const boxes = Children.toArray(children).filter((c): c is ReactElement<{ id: string; children: ReactNode }> => isValidElement(c) && typeof (c.props as { id?: unknown }).id === 'string');
  const ids = boxes.map((b) => b.props.id);
  const pinned = state.pinned.filter((id) => ids.includes(id));
  const order = [...pinned, ...ids.filter((id) => !pinned.includes(id))].filter((id) => !state.hidden.includes(id));

  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);

  // FLIP: note where each box is just before a change, then after the change slide each one from
  // its old place to its new one (and fade in any that are new, like boxes being shown again).
  const els = useRef(new Map<string, HTMLDivElement>());
  const before = useRef<{ tops: Map<string, number>; order: string; at: number } | null>(null);
  const capture = () => {
    before.current = {
      tops: new Map([...els.current].filter(([, el]) => el.isConnected).map(([id, el]) => [id, el.getBoundingClientRect().top])),
      order: order.join(),
      at: Date.now(),
    };
  };
  useEffect(() => {
    const onCapture = (e: Event) => (e as CustomEvent<string>).detail === page && capture();
    window.addEventListener(CAPTURE, onCapture);
    return () => window.removeEventListener(CAPTURE, onCapture);
  }, [page]);
  useLayoutEffect(() => {
    const snap = before.current;
    if (!snap) return;
    // Other renders can land before the change itself (the menu closing): wait for the new order.
    if (snap.order === order.join() && Date.now() - snap.at < 2000) return;
    before.current = null;
    const was = snap.tops;
    for (const id of order) {
      const el = els.current.get(id);
      if (!el) continue;
      const old = was.get(id);
      if (old === undefined) {
        el.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], APPEAR);
        continue;
      }
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], SLIDE);
    }
  });

  const pin = (id: string) => {
    capture();
    save(pinned.includes(id) ? state.pinned.filter((x) => x !== id) : [id, ...state.pinned.filter((x) => x !== id)], state.hidden);
  };
  const hide = (id: string) => {
    const el = els.current.get(id);
    const done = () => {
      capture();
      save(state.pinned.filter((x) => x !== id), [...state.hidden, id]);
    };
    // Fade and shrink away first; then the boxes below slide up into its place.
    if (el) el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], { ...VANISH, fill: 'forwards' }).finished.then(done, done);
    else done();
  };

  return (
    <>
      {order.map((id) => (
        <HoldBox
          key={id}
          pinned={pinned.includes(id)}
          boxRef={(el) => {
            if (el) els.current.set(id, el);
            else els.current.delete(id);
          }}
          onHold={(el) => setMenu({ id, el })}
        >
          {boxes.find((b) => b.props.id === id)!.props.children}
        </HoldBox>
      ))}
      {menu && <BoxMenu el={menu.el} pinned={pinned.includes(menu.id)} onClose={() => setMenu(null)} onPin={() => pin(menu.id)} onHide={() => hide(menu.id)} />}
    </>
  );
}

/** "Show Hidden Items": just text, at the bottom of a page, when something on it is hidden. */
export function ShowHidden({ page }: { page: string }) {
  const { state, save } = useBoxState(page);
  if (!state.hidden.length) return null;
  return (
    <button
      type="button"
      className="show-hidden"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(CAPTURE, { detail: page }));
        save(state.pinned, []);
      }}
    >
      Show Hidden Items
    </button>
  );
}

/** A box you can touch and hold (anywhere but its own controls and stats) to open its menu. */
function HoldBox({ children, onHold, pinned, boxRef }: { children: ReactNode; onHold: (el: HTMLElement) => void; pinned: boolean; boxRef: (el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const from = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        boxRef(el);
      }}
      className="hold-box"
      onPointerDown={(e) => {
        fired.current = false;
        if ((e.target as Element).closest(OWN_HOLD)) return;
        from.current = [e.clientX, e.clientY];
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          const card = ref.current?.firstElementChild as HTMLElement | null;
          if (card) onHold(card);
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (from.current && Math.hypot(e.clientX - from.current[0], e.clientY - from.current[1]) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClickCapture={(e) => {
        if (!fired.current) return;
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {/* Pinned: a small pin in the corner, as Notes marks pinned notes. */}
      {pinned && (
        <span className="box-pin" aria-label="Pinned">
          <MaskSym name="pin.fill" size={13} />
        </span>
      )}
    </div>
  );
}

const CLOSE_MS = 300;


/**
 * iOS's context menu: the page blurs and dims, the box stays sharp over it (a copy, drawn over the
 * blur, at its own size), and the menu opens beside it: under it if there's room, else above, else over its lower edge.
 */
function BoxMenu(props: { el: HTMLElement; pinned: boolean; onClose: () => void; onPin: () => void; onHide: () => void }) {
  const lift = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const r = props.el.getBoundingClientRect();

  useLayoutEffect(() => {
    const holder = lift.current;
    if (!holder) return;
    // Copy the box, canvases included (a copied canvas starts blank).
    const copy = props.el.cloneNode(true) as HTMLElement;
    copy.style.margin = '0';
    holder.appendChild(copy);
    const from = props.el.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((c, i) => {
      const src = from[i];
      if (!src) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
    });
    props.el.style.visibility = 'hidden';
    return () => {
      props.el.style.visibility = '';
      holder.replaceChildren();
    };
  }, [props.el]);

  const close = (then?: () => void) => {
    if (closing) return;
    setClosing(true);
    // The real box comes back under the fading blur (the copy fades with it), and the action runs
    // now, so a pinned box is already sliding up as the menu goes.
    props.el.style.visibility = '';
    then?.();
    window.setTimeout(props.onClose, CLOSE_MS);
  };

  const MENU_H = 2 * 44 + 12;
  const below = r.bottom + 10;
  const room = window.innerHeight - 110; // keep clear of the tab bar
  const top = below + MENU_H <= room ? below : r.top - 10 - MENU_H >= 60 ? r.top - 10 - MENU_H : room - MENU_H;

  return createPortal(
    <div className={`ctx-scrim ${closing ? 'is-closing' : ''}`} onClick={() => close()} onContextMenu={(e) => e.preventDefault()}>
      {/* Only the blur and dimming fade in: the box is lifted at full strength from the start. */}
      <div className={`ctx-blur ${closing ? 'is-closing' : ''}`} />
      <div ref={lift} className={`ctx-lift ${closing ? 'is-closing' : ''}`} style={{ top: r.top, left: r.left, width: r.width, height: r.height }} />
      <div className={`ios-menu ctx-menu ${closing ? 'is-closing' : ''}`} role="menu" style={{ top, left: r.left, transformOrigin: top >= r.bottom ? 'top left' : 'bottom left' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" role="menuitem" className="ios-menu-item" onClick={() => close(props.onPin)}>
          <span>{props.pinned ? 'Unpin' : 'Pin to Top'}</span>
          <span className="ios-menu-icon">
            <MaskSym name={props.pinned ? 'pin.slash' : 'pin'} size={17} />
          </span>
        </button>
        <button type="button" role="menuitem" className="ios-menu-item" onClick={() => close(props.onHide)}>
          <span>Hide</span>
          <span className="ios-menu-icon">
            <MaskSym name="eye.slash" size={17} />
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
