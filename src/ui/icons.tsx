import type { ReactElement } from 'react';

const P = (d: string) => <path d={d} />;

/** 기능버튼 아이콘 (24×24, 선 아이콘) */
export const ICONS: Record<string, ReactElement> = {
  labor: <><circle cx="12" cy="7.5" r="3.5" />{P('M4.5 20.5c.8-4.2 3.8-6.5 7.5-6.5s6.7 2.3 7.5 6.5')}</>,
  material: <>{P('M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z')}{P('M3.5 7.5 12 12l8.5-4.5M12 12v9')}</>,
  machine: <>{P('M2.5 17h11v-4.5h-8z')}{P('M8 12.5V9h4l1.5 3.5')}{P('M13.5 12.5 18 5l3 1.5-1.5 5')}<circle cx="5.5" cy="19" r="1.5" /><circle cx="11" cy="19" r="1.5" /></>,
  calc: <>{P('M3 13V4h9l9 9-8 8z')}<circle cx="7.5" cy="8.5" r="1.4" /></>,
  unit: <><rect x="3.5" y="3.5" width="17" height="17" />{P('M3.5 9h17M3.5 14.5h17M9 3.5v17')}</>,
  market: <>{P('M5 3.5h10l4 4v13H5z')}{P('M8.5 12.5l2.2 2.2 4.8-4.7')}</>,
  quote: <>{P('M5 3.5h14v17H5z')}{P('M8.5 8h7M8.5 12h7M8.5 16h4')}</>,
  folder: <>{P('M3.5 6h6l2 2.5h9v11h-17z')}</>,
  docs: <>{P('M7 3.5h8.5L19 7v13.5H7z')}{P('M10 11h6M10 14.5h6M10 18h3.5')}{P('M4.5 7v15H15')}</>,
  db: <><ellipse cx="12" cy="6" rx="7.5" ry="2.5" />{P('M4.5 6v12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V6M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5')}</>,
  book: <>{P('M4 5c3-1.3 5.5-1.3 8 .8 2.5-2.1 5-2.1 8-.8v14c-3-1.3-5.5-1.3-8 .8-2.5-2.1-5-2.1-8-.8zM12 5.8v14')}</>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" />{P('m20.5 20.5-5.2-5.2')}</>,
  net: <><rect x="5" y="3.5" width="14" height="17" rx="1" />{P('M8 7.5h8M8 12h2M12 12h2M8 16h2M12 16h2M16 12v4')}</>,
  sum: <>{P('M17.5 4.5h-11l6 7.5-6 7.5h11')}</>,
  plus: <><rect x="3.5" y="3.5" width="17" height="17" />{P('M12 7.5v9M7.5 12h9')}</>,
  pct: <>{P('M19 5 5 19')}<circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  bid: <>{P('m14 4 6 6M11.5 6.5l6 6M9 9l6 6')}{P('m12 10.5-8.5 8.5')}{P('M3.5 21h9')}</>,
  recalc: <>{P('M20 12a8 8 0 1 1-2.4-5.7')}{P('M20 4.5v5h-5')}</>,
  insert: <>{P('M3.5 6.5h17M3.5 17.5h17M12 9v6M9 12h6')}</>,
  del: <>{P('M3.5 6.5h17M3.5 17.5h17M9 12h6')}</>,
  phase: <>{P('M4 4h16v4H4zM4 16h7v4H4zM13 16h7v4h-7z')}{P('M12 8v4M7.5 12h9M7.5 12v4M16.5 12v4')}</>,
  print: <>{P('M7 8V3.5h10V8M7 17H4.5V8h15v9H17')}{P('M7 13.5h10v7H7z')}</>,
  excel: <><rect x="3.5" y="3.5" width="17" height="17" />{P('m8.5 8.5 7 7M15.5 8.5l-7 7')}</>,
  doc: <>{P('M6 3.5h9l3.5 3.5v13.5H6z')}{P('M9 11h6.5M9 14.5h6.5M9 18h4')}</>,
  docOk: <>{P('M6 3.5h9l3.5 3.5v13.5H6z')}{P('m9 14 2 2 4-4')}</>,
  chart: <>{P('M4 20h16M7 16V9M12 16V5M17 16v-4')}</>,
  swap: <>{P('M4 7h10l-3-3M20 17H10l3 3')}</>,
  link: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="16" r="3" />{P('M10.5 10.5l3 3')}</>,
  done: <>{P('M5 20V5h11l3 3v12z')}{P('m9 13 2 2 4-4')}{P('M5 20h14')}</>,
  compare: <>{P('M4 6h7v12H4zM13 6h7v12h-7z')}</>,
  new: <>{P('M6 3.5h9l3.5 3.5v13.5H6z')}{P('M12 10v7M8.5 13.5h7')}</>,
  open: <>{P('M3.5 6h6l2 2.5h9v11h-17z')}{P('M3.5 11h17')}</>,
  copy: <>{P('M8 4h11v13H8z')}{P('M5 7v13h11')}</>,
  trash: <>{P('M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13')}</>,
  rate: <>{P('M4 18h16')}{P('M6 14l4-4 3 3 5-6')}</>,
  check: <>{P('M4 5h4v4H4zM4 15h4v4H4z')}{P('m5 7 1 1 2-2')}{P('M11 7h9M11 17h9')}</>,
  rebuild: <>{P('M6 3.5h9l3.5 3.5v13.5H6z')}{P('M19 12a5 5 0 1 1-1.5-3.6')}</>,
  adj: <>{P('M4 12h16M12 4v16')}{P('M16 8l4 4-4 4')}</>,
  vendor: <>{P('M4 20V8l8-4 8 4v12')}{P('M9 20v-6h6v6')}</>,
  filter: <>{P('M4 5h16l-6 7v6l-4 2v-8z')}</>,
  cols3: <>{P('M4 5h4v14H4zM10 5h4v14h-4zM16 5h4v14h-4z')}</>,
  lines: <>{P('M4 6h16M4 12h16M4 18h16')}</>,
  paste: <>{P('M8 4h8v3H8zM6 6H4v15h16V6h-2')}</>,
  upload: <>{P('M12 16V5M7.5 9.5 12 5l4.5 4.5')}{P('M4 19h16')}</>,
  confirm: <>{P('M12 3.5l7 3v5.5c0 4.3-3 7.7-7 8.5-4-.8-7-4.2-7-8.5V6.5z')}{P('m9 12 2 2 4-4')}</>,
  safety: <>{P('M12 3.5l7 3v5.5c0 4.3-3 7.7-7 8.5-4-.8-7-4.2-7-8.5V6.5z')}</>,
  form: <>{P('M5 3.5h14v17H5z')}{P('M8 8h8M8 12h8M8 16h5')}</>,
  undo: <>{P('M9 7H5V3')}{P('M5 7a8 8 0 1 1-1.5 6')}</>,
};

export function Icon({ name }: { name: keyof typeof ICONS | string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name] ?? ICONS.doc}
    </svg>
  );
}
