import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Board from "./Board.jsx";
import { clipPolyline } from "./eraseGeometry.js";
import { splitOwnedPolyline } from "./routeGeometry.js";
import "./styles.css";
const seed = [
  [
    "Sketch the next idea",
    "Leave room for the thought to become clearer.",
    "pink",
    "✦",
  ],
  [
    "Gather loose threads",
    "Collect the small pieces that belong together.",
    "blue",
    "♡",
  ],
  [
    "Make the first pass",
    "A gentle starting point is still progress.",
    "yellow",
    "✎",
  ],
  [
    "Stabilize the workflow",
    "Smooth out the rough edges in the current process.",
    "lav",
    "☼",
  ],
  [
    "Creative direction",
    "Keep the human point of view close to the work.",
    "mint",
    "☁",
  ],
  [
    "Try a small experiment",
    "Test one useful change and notice what happens.",
    "blue",
    "☼",
  ],
];
const api = async (path, opts = {}) => {
  const r = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw Error(r.status === 409 ? "conflict" : await r.text());
  return r.json();
};
const colors = ["pink", "blue", "yellow", "mint", "lav"];
const scenePresets = {
  window: "scene-window",
  sunset: "scene-sunset",
};
function Note({ n, onUpdate, onDelete, zoom, tool, strokes }) {
  const drag = useRef(null);
  return (
    <article
      data-note-id={n.id}
      className={"note " + (n.color || "yellow")}
      tabIndex={0}
      style={{
        left: n.x || 80,
        top: n.y || 80,
        "--r": `${((String(n.id).charCodeAt(0) || 3) % 7) - 3}deg`,
        pointerEvents: tool === "select" ? "auto" : "none",
      }}
      onPointerDown={(e) => {
        // Hand mode reserves middle-click for moving an existing note. Left
        // click remains available for selecting the note and entering text.
        if (e.button !== 1) {
          return;
        }
        // Middle-button movement must win even when it starts inside note text;
        // suppress the browser's PRIMARY-selection paste gesture and capture
        // the pointer for the whole move.
        e.preventDefault();
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          ox: n.x || 80,
          oy: n.y || 80,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
      onPointerMove={(e) =>
        drag.current &&
        onUpdate(
          n,
          {
            x: drag.current.ox + (e.clientX - drag.current.x) / zoom,
            y: drag.current.oy + (e.clientY - drag.current.y) / zoom,
          },
          false,
        )
      }
      onPointerUp={(e) => {
        if (drag.current) {
          if (document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-trash]")) onDelete(n);
          else onUpdate(n, { x: n.x, y: n.y });
          drag.current = null;
        }
      }}
      onPointerCancel={() => { drag.current = null; }}
      // Browsers may briefly report lost capture while the note is rerendered
      // during a sustained drag; keep the gesture alive until pointerup/cancel.
      onLostPointerCapture={() => {}}
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && !e.target.closest("[contenteditable],input,button")) {
          e.preventDefault();
          onDelete(n);
        }
      }}
    >
      <div className="grab">
        ⠿{" "}
      </div>
      <svg className="note-ink" viewBox="0 0 235 174" preserveAspectRatio="none">
        {strokes.map(s => <path key={s.id} d={s.points.map((p,i)=>`${i?"L":"M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <h3
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onUpdate(n, { title: e.currentTarget.innerText })}
      >
        {n.title}
      </h3>
      <p
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onUpdate(n, { body: e.currentTarget.innerText })}
      >
        {n.body}
      </p>
      <div className="meta">
        <label>
          <input
            type="checkbox"
            checked={!!n.done}
            onChange={(e) => onUpdate(n, { done: e.target.checked })}
          />
          {n.done ? "Done" : "Open"}
        </label>
        <span className="stamp">{n.stamp || "✦"}</span>
      </div>
    </article>
  );
}
function DrawLayer({ strokes, tool, color, markerSize, eraserSize, onDraw, zoom, width, height, notes }) {
  const ref = useRef(null), drawing = useRef(null), cursor = useRef(null), cursorMark = useRef(null), [, repaint] = React.useState(0);
  const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const point = (e) => {
    const svg = ref.current, matrix = svg?.getScreenCTM()?.inverse();
    if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null;
  };
  return (
    <svg
      ref={ref}
      className="draw"
      // Drawing must sit above notes so the live footprint remains visible on
      // both surfaces. Hand mode is deliberately transparent so notes keep
      // their normal editing/dragging behavior.
      style={{ zIndex: tool === "select" ? 1 : 4, pointerEvents: tool === "select" ? "none" : "auto" }}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onPointerDown={(e) => {
        if (tool === "select" || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = point(e); if (!p) return;
        drawing.current = [p];
        repaint(x => x + 1);
      }}
      onPointerMove={(e) => {
        const p = point(e);
        if (cursor.current && p) { cursor.current.setAttribute("cx", p.x); cursor.current.setAttribute("cy", p.y); }
        if (cursorMark.current && p) cursorMark.current.setAttribute("transform", `translate(${p.x} ${p.y})`);
        if (!drawing.current) return;
        if (!p) return;
        drawing.current.push(p);
        repaint(x => x + 1);
      }}
      onPointerUp={(e) => {
        if (drawing.current) {
          onDraw(drawing.current, tool, notes);
          drawing.current = null;
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => { drawing.current = null; }}
      onPointerLeave={() => { if (cursor.current) cursor.current.setAttribute("visibility", "hidden"); }}
      onPointerEnter={() => { if (cursor.current) cursor.current.setAttribute("visibility", tool === "select" ? "hidden" : "visible"); }}
    >
      {strokes.filter((s) => !s.deleted).map((s) => (
        <path key={s.id} d={path(s.points)} fill="none" stroke={s.color}
          strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {drawing.current && tool !== "eraser" && <path d={path(drawing.current)} fill="none" stroke={color}
        strokeWidth={markerSize} strokeLinecap="round" strokeLinejoin="round" />}
      {drawing.current && tool === "eraser" && <path d={path(drawing.current)} fill="none" stroke="#453c54" opacity=".18"
        strokeWidth={eraserSize} strokeLinecap="round" strokeLinejoin="round" />}
      <circle ref={cursor} cx="0" cy="0" r={tool === "eraser" ? eraserSize / 2 : markerSize / 2} fill="none"
        stroke={tool === "eraser" ? "#453c54" : color} strokeDasharray={tool === "eraser" ? "4 3" : "none"}
        strokeWidth={tool === "eraser" ? 1.5 / zoom : 2 / zoom} pointerEvents="none" visibility={tool === "select" ? "hidden" : "visible"} />
      {tool !== "eraser" && <g ref={cursorMark} transform="translate(0 0)">
        <circle cx="0" cy="0" r={Math.max(2.5, Math.min(5, markerSize / 2.5))}
          fill={color} stroke="#fffdf8" strokeWidth={1.25 / zoom} pointerEvents="none"
          visibility={tool === "select" ? "hidden" : "visible"} />
        <path d="M-3.5 0H3.5M0-3.5V3.5" stroke="#fffdf8" strokeWidth={1.2 / zoom}
          strokeLinecap="round" pointerEvents="none" visibility={tool === "select" ? "hidden" : "visible"} />
      </g>}
    </svg>
  );
}
function SceneLayer({ preset, scene, pan, scale, children }) {
  const { scene_width: width, scene_height: height, board_x: boardX, board_y: boardY } = scene;
  const sceneStyle = {
    width: width * scale,
    height: height * scale,
    transform: `translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px))`,
  };
  const boardStyle = {
    left: boardX * scale,
    top: boardY * scale,
    width: (children.props.board.width + 36) * scale,
    height: (children.props.board.height + 36) * scale,
  };
  return <div className="scene-world" style={sceneStyle} aria-hidden="true">
    <div className={`scene-background scene-${preset}`}><div className="scene-sun" /></div>
    {children}
  </div>;
}
function CameraLayer({ children, board, scene, pan, sceneScale }) {
  return <section className="board-shell" style={{ left: scene.board_x * sceneScale, top: scene.board_y * sceneScale, width: board.width, height: board.height, transform: `translate(${pan.x}px,${pan.y}px) scale(${sceneScale})` }}>{children}</section>;
}
function App() {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setMarker(false); setOpen(false); paletteDrag.current = null; } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [notes, setNotes] = useState([]),
    [trash, setTrash] = useState([]),
    [board, setBoard] = useState({
      title: "Our little ideas",
      subtitle: "A gentle place to make, move, and wonder.",
      width: 1600,
      height: 1100,
      version: 1,
    }),
    [strokes, setStrokes] = useState([]),
    [zoom, setZoom] = useState(1),
    [widthPct, setWidthPct] = useState(100),
    [heightPct, setHeightPct] = useState(100),
    [sceneConfig, setSceneConfig] = useState({ preset: "window", frame_style: "paper", scene_width: 200000, scene_height: 150000, board_x: 9918, board_y: 7450, version: 1 }),
    [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight }),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [tool, setTool] = useState("select"),
    [marker, setMarker] = useState(false),
    [markerColor, setMarkerColor] = useState("#625276"), [markerSize, setMarkerSize] = useState(6),
    [eraserSize, setEraserSize] = useState(28),
    [scene, setScene] = useState("window"),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ title: "", body: "", color: "yellow" }),
    [conflict, setConflict] = useState(false),
    [shrinkNotice, setShrinkNotice] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashDragOver, setTrashDragOver] = useState(false);
  const panDrag = useRef(null);
  const paletteDrag = useRef(null);
  const cameraReady = useRef(false);
  const cameraKey = "sticky-sticky.camera.v1";
  const readCamera = () => { try { const v=JSON.parse(localStorage.getItem(cameraKey)||"null"); if (!v || !Number.isFinite(v.zoom) || v.zoom < .45 || v.zoom > 1.5 || !Number.isFinite(v.pan?.x) || !Number.isFinite(v.pan?.y)) return null; return {zoom:v.zoom,pan:{x:v.pan.x,y:v.pan.y}}; } catch { return null; } };
  useEffect(() => {
    const move = (e) => { if (paletteDrag.current) paletteDrag.current.last = { x:e.clientX, y:e.clientY }; };
    const up = async (e) => {
      const d=paletteDrag.current; if (!d) return; paletteDrag.current=null;
      const el=document.elementFromPoint(e.clientX,e.clientY), boardEl=el?.closest(".board");
      if (!boardEl) return;
      const r=boardEl.getBoundingClientRect();
      await addAt((e.clientX-r.left)/sceneScale,(e.clientY-r.top)/sceneScale,d.color);
    };
    addEventListener("pointermove",move); addEventListener("pointerup",up);
    return () => { removeEventListener("pointermove",move); removeEventListener("pointerup",up); };
  }, []);
  useEffect(() => {
    const onResize = () => setViewport({ width: innerWidth, height: innerHeight });
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const [b, ns, trashNs, ss, sc] = await Promise.all([
          api("/board").catch(() => board),
          api("/notes"),
          api("/trash").catch(() => []),
          api("/strokes").catch(() => []),
          api("/scene").catch(() => null),
        ]);
        setBoard(b);
        setWidthPct(Math.max(25, Math.min(10000, Math.round((b.width / 1600) * 100))));
        setHeightPct(Math.max(25, Math.min(10000, Math.round((b.height / 1100) * 100))));
        if (sc) setSceneConfig(sc);
        setNotes(ns);
        setTrash(Array.isArray(trashNs) ? trashNs : []);
        setStrokes(Array.isArray(ss) ? ss : ss.strokes || []);
        const savedCamera=readCamera(); if(savedCamera){ setZoom(savedCamera.zoom); setPan(savedCamera.pan); }
        cameraReady.current=true;
      } catch {
        setConflict(true);
      }
    })();
  }, []);
  useEffect(() => { if (!cameraReady.current) return; const t=setTimeout(()=>{ try { localStorage.setItem(cameraKey,JSON.stringify({zoom,pan})); } catch {} },150); return ()=>clearTimeout(t); }, [zoom,pan]);
  const boardSave = useRef(Promise.resolve());
  const boardVersion = useRef(board.version);
  useEffect(() => { boardVersion.current = board.version; }, [board.version]);
  function saveBoard(p) {
    boardSave.current = boardSave.current.then(async () => {
      try {
      const latest = await api("/board");
      const b = await api("/board", {
        method: "PUT",
        body: JSON.stringify({ ...p, version: latest.version }),
      });
      setBoard(b);
      boardVersion.current = b.version;
      } catch (error) {
        if (/board_(width|height)_clips_content/.test(error.message)) {
          const latest = await api("/board").catch(() => null);
          if (latest) {
            setBoard(latest);
            setWidthPct(Math.round((latest.width / 1600) * 100));
            setHeightPct(Math.round((latest.height / 1100) * 100));
          }
          setShrinkNotice("Move content inward to shrink further.");
        } else setConflict(true);
      }
    });
    return boardSave.current;
  }
  async function update(n, p, save = true) {
    setNotes((xs) => xs.map((x) => (x.id === n.id ? { ...x, ...p } : x)));
    if (save)
      try {
        const f = await api("/notes/" + n.id, {
          method: "PATCH",
          body: JSON.stringify({ ...p, version: n.version }),
        });
        setNotes((xs) => xs.map((x) => (x.id === n.id ? f : x)));
      } catch {
        setConflict(true);
      }
  }
  async function remove(n) {
    try {
      await api("/notes/" + n.id, { method: "DELETE" });
      setTrash((t) => [...t, n]);
      setNotes((xs) => xs.filter((x) => x.id !== n.id));
      history.current.push({ type: "note-delete", note: n });
    } catch {
      setConflict(true);
    }
  }
  async function add(e) {
    e.preventDefault();
    const n = await api("/notes", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        stamp: "✦",
        x: 120 + Math.random() * 400,
        y: 130 + Math.random() * 280,
      }),
    });
    setNotes((x) => [...x, n]);
    setForm({ title: "", body: "", color: "yellow" });
    setOpen(false);
  }
  async function addAt(x, y, color) {
    const n = await api("/notes", { method:"POST", body:JSON.stringify({title:"",body:"",color,stamp:"✦",x:Math.max(0,x-118),y:Math.max(0,y-80)}) });
    setNotes(xs=>[...xs,n]); setOpen(false);
    requestAnimationFrame(()=>document.querySelector(`.note[data-note-id="${n.id}"] h3`)?.focus());
  }
  const strokesRef = useRef(strokes), colorRef = useRef(markerColor), eraserRef = useRef(eraserSize), markerRef = useRef(markerSize), history = useRef([]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { colorRef.current = markerColor; }, [markerColor]);
  useEffect(() => { eraserRef.current = eraserSize; }, [eraserSize]);
  useEffect(() => { markerRef.current = markerSize; }, [markerSize]);
  const segmentDistance = (a, b, c, d) => {
    const abx=b.x-a.x, aby=b.y-a.y, cdx=d.x-c.x, cdy=d.y-c.y;
    const cross=(abx*cdy-aby*cdx);
    if (Math.abs(cross)>1e-9) { const t=((c.x-a.x)*cdy-(c.y-a.y)*cdx)/cross, u=((c.x-a.x)*aby-(c.y-a.y)*abx)/cross; if(t>=0&&t<=1&&u>=0&&u<=1)return 0; }
    const dist=(p,x,y)=>{const dx=y.x-x.x,dy=y.y-x.y,t=Math.max(0,Math.min(1,((p.x-x.x)*dx+(p.y-x.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-(x.x+t*dx),p.y-(x.y+t*dy));};
    return Math.min(dist(a,c,d),dist(b,c,d),dist(c,a,b),dist(d,a,b));
  };
  function ownership(points, ns) {
    const owner = (p) => [...ns].reverse().find(n => {
      const boardSvg = document.querySelector("svg.draw");
      const noteSvg = document.querySelector(`[data-note-id="${n.id}"] svg.note-ink`);
      const fromBoard = boardSvg?.getScreenCTM(), toLocal = noteSvg?.getScreenCTM()?.inverse();
      const q = fromBoard && toLocal ? new DOMPoint(p.x, p.y).matrixTransform(fromBoard).matrixTransform(toLocal) : { x:p.x-n.x, y:p.y-n.y };
      return q.x >= 0 && q.x <= 235 && q.y >= 0 && q.y <= 174;
    })?.id || null;
    if (points.length < 2) return points.length ? [{note_id: owner(points[0]), points}] : [];
    return splitOwnedPolyline(points, ns, (p, n) => {
      const boardSvg = document.querySelector("svg.draw");
      const noteSvg = document.querySelector(`[data-note-id="${n.id}"] svg.note-ink`);
      const fromBoard = boardSvg?.getScreenCTM(), toLocal = noteSvg?.getScreenCTM()?.inverse();
      return fromBoard && toLocal ? new DOMPoint(p.x, p.y).matrixTransform(fromBoard).matrixTransform(toLocal) : {x:p.x-n.x,y:p.y-n.y};
    }, q => q.x >= 0 && q.x <= 235 && q.y >= 0 && q.y <= 174);
  }
  const toNoteLocal = (p, n) => {
    const boardSvg = document.querySelector("svg.draw");
    const noteSvg = document.querySelector(`[data-note-id="${n.id}"] svg.note-ink`);
    const fromBoard = boardSvg?.getScreenCTM();
    const toLocal = noteSvg?.getScreenCTM()?.inverse();
    if (!fromBoard || !toLocal) return { x: p.x - n.x, y: p.y - n.y };
    return new DOMPoint(p.x, p.y).matrixTransform(fromBoard).matrixTransform(toLocal);
  };
  async function draw(points, mode, ns) {
    if (mode === "eraser") {
      const radius = eraserRef.current / 2;
      const surface = ownership(points.slice(0, 2), ns)[0]?.note_id || null;
      const surfaceNote = surface && ns.find(n => n.id === surface);
      const localEraser = surfaceNote ? points.map(p => toNoteLocal(p, surfaceNote)) : points;
      const fragments=[]; const hit=[];
      for (const s of strokesRef.current.filter(s=>!s.deleted && (s.note_id || null) === surface)) {
        const clipped=clipPolyline(s.points,localEraser,radius,s.width);
        if(clipped.changed) { hit.push(s); for(const fragment of clipped.polylines) fragments.push({points:fragment,color:s.color,width:s.width,note_id:s.note_id || null}); }
      }
      if (!hit.length) return;
      try { const result=await api("/strokes/batch",{method:"POST",body:JSON.stringify({originals:hit.map(s=>({id:s.id,version:s.version})),fragments})});
        const made=(result.fragments||[]).map(s=>({...s,points:typeof s.points==='string'?JSON.parse(s.points):s.points}));
        setStrokes(xs => [...xs.map(s => hit.some(h=>h.id===s.id) ? {...s,deleted:true,version:(s.version||1)+1} : s),...made]);
        history.current.push({type:"erase", strokes:hit, fragments:made});
      } catch { setConflict(true); }
      return;
    }
    const pieces = ownership(points, ns).map(piece => {
      const note = piece.note_id && ns.find(n => n.id === piece.note_id);
      return note ? {...piece, points: piece.points.map(p => toNoteLocal(p, note))} : piece;
    });
    try {
      const saved = await Promise.all(pieces.map(piece => api("/strokes", { method: "POST", body: JSON.stringify({...piece, color: colorRef.current, width: markerRef.current}) })));
      setStrokes((x) => [...x, ...saved]); history.current.push({type:"draw", strokes:saved});
    } catch {
      const local = pieces.map(piece => ({...piece, color: colorRef.current, width: markerRef.current, id: crypto.randomUUID(), version: 1}));
      setStrokes((x) => [...x, ...local]); history.current.push({type:"draw", strokes:local});
    }
  }
  const gutter = Math.min(192, Math.max(24, viewport.width * 0.15));
  const fit = Math.min(
    (viewport.width - gutter * 2) / (1600 + 36),
    (viewport.height - gutter * 2) / (1100 + 36),
  );
  const sceneScale = Math.min(1, fit) * zoom;
  const sceneWidth = sceneConfig.scene_width * sceneScale;
  const sceneHeight = sceneConfig.scene_height * sceneScale;
  const maxBoardWidth = Math.max(400, sceneConfig.scene_width - sceneConfig.board_x - 1600);
  const maxBoardHeight = Math.max(400, sceneConfig.scene_height - sceneConfig.board_y - 1100);
  const maxWidthPct = Math.floor((maxBoardWidth / 1600) * 100);
  const maxHeightPct = Math.floor((maxBoardHeight / 1100) * 100);
  const activeNotes = notes.filter((n) => !n.deleted_at && !n.deleted);
  const activeStrokes = strokes.filter((s) => !s.deleted_at && !s.deleted);
  const boardStrokes = activeStrokes.filter(s => !s.note_id);
  const rawMinBoardWidth = Math.max(400, ...activeNotes.map((n) => Number(n.x || 0) + 235 + 36), ...boardStrokes.flatMap((s) => (s.points || []).map((p) => Number(p.x ?? p[0]) + Number(s.width || 0) / 2 + 18)));
  const rawMinBoardHeight = Math.max(400, ...activeNotes.map((n) => Number(n.y || 0) + 174 + 36), ...boardStrokes.flatMap((s) => (s.points || []).map((p) => Number(p.y ?? p[1]) + Number(s.width || 0) / 2 + 18)));
  const minBoardWidth = 400, minBoardHeight = 400;
  const minWidthPct = 25, minHeightPct = 25;
  const overflowEdges = { left: activeNotes.some(n => Number(n.x || 0) < 0), right: activeNotes.some(n => Number(n.x || 0) + 235 > board.width), top: activeNotes.some(n => Number(n.y || 0) < 0), bottom: activeNotes.some(n => Number(n.y || 0) + 174 > board.height) };
  const shrinkHint = shrinkNotice || "";
  const maxPanX = Math.max(0, (sceneWidth - viewport.width) / 2);
  const maxPanY = Math.max(0, (sceneHeight - viewport.height) / 2);
  const clampPan = (p) => ({
    x: Math.max(-maxPanX, Math.min(maxPanX, p.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, p.y)),
  });
  const anchorPan = {
    x: sceneWidth / 2 - (sceneConfig.board_x + board.width / 2) * sceneScale,
    y: sceneHeight / 2 - (sceneConfig.board_y + board.height / 2) * sceneScale,
  };
  const cameraPan = { x: pan.x + anchorPan.x, y: pan.y + anchorPan.y };
  const onWheel = (e) => {
    if (e.target.closest("input,textarea,select,button,.dialog,.marker-pop")) return;
    e.preventDefault();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * viewport.height : e.deltaY;
    const nextZoom = Math.max(0.45, Math.min(1.5, zoom * Math.pow(1.0015, -delta)));
    if (nextZoom === zoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pointer = { x: e.clientX - rect.left - viewport.width / 2, y: e.clientY - rect.top - viewport.height / 2 };
    const world = { x: (pointer.x - cameraPan.x) / sceneScale, y: (pointer.y - cameraPan.y) / sceneScale };
    setZoom(nextZoom);
    const nextScale = sceneScale * nextZoom / zoom;
    const nextAnchor = {
      x: (sceneConfig.scene_width * nextScale) / 2 - (sceneConfig.board_x + board.width / 2) * nextScale,
      y: (sceneConfig.scene_height * nextScale) / 2 - (sceneConfig.board_y + board.height / 2) * nextScale,
    };
    setPan(clampPan({ x: pointer.x - world.x * nextScale - nextAnchor.x, y: pointer.y - world.y * nextScale - nextAnchor.y }));
  };
  useEffect(() => setPan((p) => clampPan(p)), [zoom, viewport, board.width, board.height]);
  useEffect(() => {
    const safeWidthPct = Math.min(maxWidthPct, Math.max(minWidthPct, widthPct));
    const safeHeightPct = Math.min(maxHeightPct, Math.max(minHeightPct, heightPct));
    if (safeWidthPct !== widthPct) setWidthPct(safeWidthPct);
    if (safeHeightPct !== heightPct) setHeightPct(safeHeightPct);
    const next = Math.min(maxBoardWidth, Math.max(minBoardWidth, Math.round(1600 * safeWidthPct / 100)));
    const nextHeight = Math.min(maxBoardHeight, Math.max(minBoardHeight, Math.round(1100 * safeHeightPct / 100)));
    if (board.width !== next || board.height !== nextHeight) {
      setBoard((b) => ({ ...b, width: next, height: nextHeight }));
      setShrinkNotice("");
      saveBoard({ width: next, height: nextHeight });
    }
  }, [widthPct, heightPct, maxBoardWidth, maxBoardHeight, minBoardWidth, minBoardHeight]);
  async function updateScene(patch) {
    const next = { ...sceneConfig, ...patch };
    try { setSceneConfig(await api("/scene", { method: "PUT", body: JSON.stringify({ ...next, version: sceneConfig.version }) })); }
    catch { setConflict(true); }
  }
  const restoreFromDrop = async (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/sticky-id");
    const n = trash.find(x => String(x.id) === String(id));
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    try {
      const restored = await api("/notes/" + n.id, { method: "PATCH", body: JSON.stringify({ restore: true, x: (e.clientX - r.left) / sceneScale - 118, y: (e.clientY - r.top) / sceneScale - 80, version: n.version }) });
      setNotes(x => [...x, restored]); setTrash(x => x.filter(v => v.id !== n.id));
    } catch { setConflict(true); }
  };
  return (
    <div className="app">
      <main className="stage" onWheel={onWheel}>
        <SceneLayer preset={scene} scene={sceneConfig} pan={anchorPan} scale={sceneScale}>
        <CameraLayer board={board} scene={sceneConfig} pan={pan} sceneScale={sceneScale}>
          <Board
            width={board.width}
            height={board.height}
            frameStyle={sceneConfig.frame_style}
            overflowEdges={overflowEdges}
            title={board.title}
            subtitle={board.subtitle}
            onTitleChange={(e) => setBoard({ ...board, title: e.target.value })}
            onTitleBlur={(e) => saveBoard({ title: e.target.value })}
            onSubtitleChange={(e) => setBoard({ ...board, subtitle: e.target.value })}
            onSubtitleBlur={(e) => saveBoard({ subtitle: e.target.value })}
            onPointerDown={(e) => {
              if (open) { if (paletteDrag.current) return; if (e.target.closest("input,textarea,select,button,.note")) return; const r=e.currentTarget.getBoundingClientRect(); addAt((e.clientX-r.left)/sceneScale,(e.clientY-r.top)/sceneScale,form.color); return; }
              if (tool !== "select" || e.button !== 1 || (e.target !== e.currentTarget && !e.target.closest(".draw"))) return;
              e.preventDefault();
              panDrag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!panDrag.current) return;
              setPan(clampPan({
                x: panDrag.current.ox + e.clientX - panDrag.current.x,
                y: panDrag.current.oy + e.clientY - panDrag.current.y,
              }));
            }}
            onPointerUp={() => (panDrag.current = null)}
            onContextMenu={(e) => { if (tool !== "select") { e.preventDefault(); setTool("select"); setMarker(false); } }}
            onPointerCancel={() => (panDrag.current = null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={restoreFromDrop}
          >
            <DrawLayer
              strokes={activeStrokes.filter(s => !s.note_id)}
              tool={tool}
              color={markerColor}
              eraserSize={eraserSize}
              markerSize={markerSize}
              onDraw={draw}
              zoom={sceneScale}
              width={board.width}
              height={board.height}
              notes={activeNotes}
            />
            {notes.map((n) => (
              <Note
                key={n.id}
                n={n}
                zoom={sceneScale}
                tool={tool}
                strokes={activeStrokes.filter(s => s.note_id === n.id)}
                onUpdate={update}
                onDelete={remove}
              />
            ))}
          </Board>
        </CameraLayer>
        </SceneLayer>
      </main>
      {conflict && (
        <div className="conflict">
          Someone changed this board.{" "}
          <button onClick={() => location.reload()}>Reload safely</button>
          <button onClick={() => setConflict(false)}>Keep my view</button>
        </div>
      )}
      <button className={`trash-drop${trashDragOver ? " drag-over" : ""}`} data-trash type="button" aria-label="Trash notes" aria-expanded={trashOpen} onClick={() => setTrashOpen(x => !x)} onDragEnter={(e) => { e.preventDefault(); setTrashDragOver(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setTrashDragOver(false)} onDrop={(e) => { setTrashDragOver(false); restoreFromDrop(e); }}>🗑<span>{trash.length || ""}</span></button>
      {trashOpen && <aside className="trash-tray" aria-label="Trash">
        <strong>Trash</strong>
        <div className="trash-list">{trash.map(n => <button key={n.id} draggable className="trash-item" onDragStart={e => e.dataTransfer.setData("text/sticky-id", n.id)} onClick={async () => { try { const restored = await api("/notes/" + n.id, { method:"PATCH", body:JSON.stringify({restore:true,version:n.version}) }); setNotes(x=>[...x,restored]); setTrash(x=>x.filter(v=>v.id!==n.id)); } catch { setConflict(true); } }}>{n.title || "Untitled note"}</button>)}</div>
        <button className="empty-trash" disabled={!trash.length} style={{color:"#a11",fontWeight:700}} onClick={async () => { if (!window.confirm(`Remove ${trash.length} note${trash.length === 1 ? "" : "s"} from Trash? Content remains stored.`)) return; try { for (const n of trash) await api("/notes/" + n.id, { method:"PATCH", body:JSON.stringify({clear:true,version:n.version+1}) }); setTrash([]); } catch { setConflict(true); } }}>Empty Trash</button>
      </aside>}
      <div className="toolbar">
        <button className="new" onClick={() => { setOpen(x=>!x); setTool("select"); }}>
          ＋ New note
        </button>
        {open && <div className="marker-pop note-palette" role="dialog" aria-label="Choose note color">
          <b>Choose a color, then click the board</b>
          {colors.map(c=><button key={c} className={`cap ${c} ${form.color===c?"active":""}`} onPointerDown={(e)=>{if(e.button!==0)return; paletteDrag.current={color:c,last:{x:e.clientX,y:e.clientY}}; e.currentTarget.setPointerCapture?.(e.pointerId);}} onClick={()=>setForm(f=>({...f,color:c}))}>{c}</button>)}
          <button onClick={()=>setOpen(false)}>Cancel</button>
        </div>}
        <button
          onClick={async () => {
            const action = history.current.pop(); if (!action) return;
            try {
              if (action.type === "draw") { for (const s of action.strokes) await api("/strokes/" + s.id, { method: "DELETE" }); setStrokes(x => x.filter(s => !action.strokes.some(a=>a.id===s.id))); }
              else if (action.type === "erase") {
                for (const f of action.fragments || []) await api("/strokes/" + f.id, { method:"DELETE" });
                const restored=[]; for (const s of action.strokes) restored.push(await api("/strokes/" + s.id, { method:"PATCH", body:JSON.stringify({restore:true,version:s.version+1}) }));
                setStrokes(x => [...x.filter(s => !(action.fragments||[]).some(f=>f.id===s.id)), ...restored]);
              } else if (action.type === "note-delete") {
                const restored = await api("/notes/" + action.note.id, { method: "PATCH", body: JSON.stringify({ restore: true, version: action.note.version + 1 }) });
                setNotes(x => [...x, restored]);
                setTrash(x => x.filter(n => n.id !== action.note.id));
              } else { const restored=[]; for (const s of action.strokes) restored.push(await api("/strokes/" + s.id, { method:"PATCH", body:JSON.stringify({restore:true,version:s.version+1}) })); setStrokes(x => x.map(s => restored.find(r=>r.id===s.id) || s)); }
            } catch { setConflict(true); }
          }}
        >
          ↶ Undo
        </button>
        <button onClick={async () => { const preset = scene === "window" ? "sunset" : "window"; setScene(preset); try { const next = await api("/scene", { method: "PUT", body: JSON.stringify({ ...sceneConfig, preset, version: sceneConfig.version }) }); setSceneConfig(next); } catch { setConflict(true); } }}>
          Scene: {scene}
        </button>
        <button onClick={() => updateScene({ frame_style: sceneConfig.frame_style === "paper" ? "silver" : sceneConfig.frame_style === "silver" ? "wood" : "paper" })}>Frame: {sceneConfig.frame_style}</button>
        <button
          className={tool === "pen" ? "active" : ""}
          onClick={() => {
            setTool("pen");
            setMarker(!marker);
          }}
        >
          ✎ Marker
        </button>
        <button className={tool === "select" ? "active" : ""} title="Left-click to select or edit; middle-click to move" onClick={() => { setTool("select"); setMarker(false); }}>✋ Hand</button>
        {marker && (
          <div className="marker-pop">
            <b>Pick a marker</b>
            {colors.map((c) => (
              <button
                key={c}
                className={"cap " + c}
                onClick={() => {
                  setMarkerColor({ pink: "#d95b78", blue: "#3d9bb6", yellow: "#c28a00", mint: "#3b9d70", lav: "#7650b8" }[c]);
                  setTool("pen");
                  setMarker(false);
                }}
              >
                {c}
              </button>
            ))}
            <label className="custom-color">Custom <input aria-label="Custom marker color" type="color" value={markerColor} onChange={(e) => { setMarkerColor(e.target.value); setTool("pen"); }} /></label>
            <button
              className="eraser"
              onClick={() => {
                setTool("eraser");
                setMarker(false);
              }}
            >
              Eraser
            </button>
            <label className="eraser-size">Eraser diameter <input aria-label="Eraser diameter" type="range" min="12" max="72" step="4" value={eraserSize} onChange={(e) => setEraserSize(Number(e.target.value))} /></label>
            <label className="marker-size">Marker diameter <input aria-label="Marker diameter" type="range" min="2" max="32" step="1" value={markerSize} onChange={(e) => setMarkerSize(Number(e.target.value))} /></label>
          </div>
        )}
      </div>
      <div className="controls">
        <span>Width</span>
        <button onClick={() => setWidthPct(Math.max(minWidthPct, widthPct - 10))} disabled={widthPct <= minWidthPct} title={widthPct <= minWidthPct ? "Move content inward to shrink further" : "Shrink board width"}>
          −
        </button>
        <b>{widthPct}%</b>
        <button onClick={() => setWidthPct(Math.min(maxWidthPct, widthPct + 10))} disabled={widthPct >= maxWidthPct}>
          ＋
        </button>
        <span>Height</span>
        <button onClick={() => setHeightPct(Math.max(minHeightPct, heightPct - 10))} disabled={heightPct <= minHeightPct} title={heightPct <= minHeightPct ? "Move content inward to shrink further" : "Shrink board height"}>−</button>
        <b>{heightPct}%</b>
        <button onClick={() => setHeightPct(Math.min(maxHeightPct, heightPct + 10))} disabled={heightPct >= maxHeightPct}>＋</button>
        <button onClick={() => { setWidthPct(100); setHeightPct(100); }} title="Reset board size">Reset</button>
        <i />
        <span>Zoom</span>
        <button onClick={() => setZoom(Math.max(0.45, zoom - 0.1))}>−</button>
        <b>{Math.round(zoom * 100)}%</b>
        <button onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}>＋</button>
      </div>
      {shrinkHint && <div className="board-size-notice" role="status">{shrinkHint}</div>}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
