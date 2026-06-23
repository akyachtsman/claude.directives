'use client';
// A Client Component: interactive, runs in the browser. This is the "active
// React button" — real useState + event handler. Author/preview it browser-only
// in ../preview.html (CDN React, no build), then it runs here verbatim under
// Next. Styling comes from the shared design contract (.btn in globals.css).
import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <button className="btn" onClick={() => setN(n + 1)}>
      Clicked {n} {n === 1 ? 'time' : 'times'}
    </button>
  );
}
