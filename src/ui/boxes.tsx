import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { saveSettings } from '../core/db';
import { useSettings } from './kit';
import { MaskSym } from './Sym';

/**
 * The boxes on a page (History's cards) can be rearranged like Home Screen apps: touch and hold
 * one and, as in iOS, it lifts over a blurred page with a menu to pin it to the top or hide it.
 * Hidden boxes come back from a "Show Hidden Boxes" link at the bottom of the page. The choices
 * are saved in Settings (so they're backed up), per page.
 */

export function Box(props: { id: string; children: ReactNode }) {
  return <>{props.children}</>;
}

/** Touch and hold this long to open a box's menu (iOS's context menus take about half a second). */
const HOLD_MS = 500;
/** Holds that start on these do their own thing (a stat explains itself, a chart scrubs, a control works). */
const OWN_HOLD = '[data-info], .fit-chart, button, a, input, textarea, select, .ios-segmented, [role="button"]';

export function Boxes({ page, children }: { page: string; children: ReactNode }) {
  const settings = useSettings();
  const state = settings.boxes?.[page] ?? { pinned: [], hidden: [] };
  const save = (pinned: string[], hidden: string[]) => void saveSettings({ boxes: { ...settings.boxes, [page]: { pinned, hidden } } });

  const boxes = Children.toArray(children).filter((c): c is ReactElement<{ id: string; children: ReactNode }> => isValidElement(c) && typeof (c.props as { id?: unknown }).id === 'string');
  const ids = boxes.map((b) => b.props.id);
  const pinned = state.pinned.filter((id) => ids.includes(id));
  const order = [...pinned, ...ids.filter((id) => !pinned.includes(id))].filter((id) => !state.hidden.includes(id));
  const hiddenHere = state.hidden.filter((id) => ids.includes(id)).length;

  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);

  return (
    <>
      {order.map((id) => (
        <HoldBox key={id} onHold={(el) => setMenu({ id, el })}>
          {boxes.find((b) => b.props.id === id)!.props.children}
        </HoldBox>
      ))}
      {hiddenHere > 0 && (
        <button type="button" className="show-hidden" onClick={() => save(state.pinned, state.hidden.filter((id) => !ids.includes(id)))}>
          Show {hiddenHere === 1 ? 'Hidden Box' : `${hiddenHere} Hidden Boxes`}
        </button>
      )}
      {menu && (
        <BoxMenu
          el={menu.el}
          pinned={pinned.includes(menu.id)}
          onClose={() => setMenu(null)}
          onPin={() => save(pinned.includes(menu.id) ? state.pinned.filter((x) => x !== menu.id) : [menu.id, ...state.pinned.filter((x) => x !== menu.id)], state.hidden)}
          onHide={() => save(state.pinned.filter((x) => x !== menu.id), [...state.hidden, menu.id])}
        />
      )}
    </>
  );
}

/** A box you can touch and hold (anywhere but its own controls and stats) to open its menu. */
function HoldBox({ children, onHold }: { children: ReactNode; onHold: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const from = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <div
      ref={ref}
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
    </div>
  );
}

const CLOSE_MS = 240;


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
    window.setTimeout(() => {
      props.onClose();
      then?.();
    }, CLOSE_MS);
  };

  const MENU_H = 2 * 44 + 12;
  const below = r.bottom + 10;
  const room = window.innerHeight - 110; // keep clear of the tab bar
  const top = below + MENU_H <= room ? below : r.top - 10 - MENU_H >= 60 ? r.top - 10 - MENU_H : room - MENU_H;

  return createPortal(
    <div className={`ctx-scrim ${closing ? 'is-closing' : ''}`} onClick={() => close()} onContextMenu={(e) => e.preventDefault()}>
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
