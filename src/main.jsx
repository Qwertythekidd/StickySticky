import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Board from "./Board.jsx";
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
function Note({ n, onUpdate, onDelete, zoom }) {
  const drag = useRef(null);
  return (
    <article
      className={"note " + (n.color || "yellow")}
      style={{
        left: n.x || 80,
        top: n.y || 80,
        "--r": `${((String(n.id).charCodeAt(0) || 3) % 7) - 3}deg`,
      }}
      onPointerDown={(e) => {
        if (e.target.closest("[contenteditable],input,button")) return;
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          ox: n.x || 80,
          oy: n.y || 80,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
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
      onPointerUp={() => {
        if (drag.current) {
          onUpdate(n, { x: n.x, y: n.y });
          drag.current = null;
        }
      }}
    >
      <div className="grab">
        ⠿{" "}
        <button className="del" onClick={() => onDelete(n)}>
          ×
        </button>
      </div>
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
function DrawLayer({ strokes, tool, onDraw, zoom, width, height }) {
  const ref = useRef(null), drawing = useRef(null);
  const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  return (
    <svg
      ref={ref}
      className="draw"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onPointerDown={(e) => {
        if (tool === "select") return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = [point(e)];
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = point(e),
          last = drawing.current.at(-1);
        drawing.current.push(p);
      }}
      onPointerUp={() => {
        if (drawing.current) {
          onDraw(drawing.current, tool);
          drawing.current = null;
        }
      }}
    >
      {strokes.filter((s) => !s.deleted).map((s) => (
        <path key={s.id} d={path(s.points)} fill="none" stroke={s.erased ? "#fffdf8" : s.color}
          strokeWidth={s.erased ? 28 : s.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {drawing.current && <path d={path(drawing.current)} fill="none" stroke={tool === "eraser" ? "#fffdf8" : "#625276"}
        strokeWidth={tool === "eraser" ? 28 : 6} strokeLinecap="round" strokeLinejoin="round" />}
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
    <div className={`scene-background scene-${preset}`}><div className="scene-window-frame" /><div className="scene-sun" /></div>
    <div className="scene-board-shadow" style={boardStyle} />
    {children}
  </div>;
}
function CameraLayer({ children, board, scene, pan, sceneScale }) {
  return <section className="board-shell" style={{ left: scene.board_x * sceneScale, top: scene.board_y * sceneScale, width: board.width, height: board.height, transform: `translate(${pan.x}px,${pan.y}px) scale(${sceneScale})` }}>{children}</section>;
}
function App() {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMarker(false);
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
    [scene, setScene] = useState("window"),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({ title: "", body: "", color: "yellow" }),
    [conflict, setConflict] = useState(false);
  const panDrag = useRef(null);
  useEffect(() => {
    const onResize = () => setViewport({ width: innerWidth, height: innerHeight });
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const [b, ns, ss, sc] = await Promise.all([
          api("/board").catch(() => board),
          api("/notes"),
          api("/strokes").catch(() => []),
          api("/scene").catch(() => null),
        ]);
        setBoard(b);
        setWidthPct(Math.max(25, Math.min(10000, Math.round((b.width / 1600) * 100))));
        setHeightPct(Math.max(25, Math.min(10000, Math.round((b.height / 1100) * 100))));
        if (sc) setSceneConfig(sc);
        setNotes(ns);
        setStrokes(Array.isArray(ss) ? ss : ss.strokes || []);
      } catch {
        setConflict(true);
      }
    })();
  }, []);
  async function saveBoard(p) {
    try {
      const b = await api("/board", {
        method: "PUT",
        body: JSON.stringify({ ...p, version: board.version }),
      });
      setBoard(b);
    } catch {
      setConflict(true);
    }
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
    await api("/notes/" + n.id, { method: "DELETE" });
    setTrash((t) => [...t, n]);
    setNotes((xs) => xs.filter((x) => x.id !== n.id));
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
  async function draw(points, mode) {
    const s = { points, color: "#625276", width: 6, erased: mode === "eraser" };
    try {
      const saved = await api("/strokes", {
        method: "POST",
        body: JSON.stringify(s),
      });
      setStrokes((x) => [...x, saved]);
    } catch {
      setStrokes((x) => [...x, { ...s, id: crypto.randomUUID() }]);
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
    setPan(clampPan({ x: pointer.x - world.x * (sceneScale * nextZoom / zoom) - anchorPan.x, y: pointer.y - world.y * (sceneScale * nextZoom / zoom) - anchorPan.y }));
  };
  useEffect(() => setPan((p) => clampPan(p)), [zoom, viewport, board.width, board.height]);
  useEffect(() => {
    if (widthPct > maxWidthPct) setWidthPct(maxWidthPct);
    if (heightPct > maxHeightPct) setHeightPct(maxHeightPct);
    const next = Math.min(maxBoardWidth, Math.round(1600 * widthPct / 100));
    const nextHeight = Math.min(maxBoardHeight, Math.round(1100 * heightPct / 100));
    if (board.width !== next || board.height !== nextHeight) {
      setBoard((b) => ({ ...b, width: next, height: nextHeight }));
      saveBoard({ width: next, height: nextHeight });
    }
  }, [widthPct, heightPct, maxBoardWidth, maxBoardHeight]);
  async function updateScene(patch) {
    const next = { ...sceneConfig, ...patch };
    try { setSceneConfig(await api("/scene", { method: "PUT", body: JSON.stringify({ ...next, version: sceneConfig.version }) })); }
    catch { setConflict(true); }
  }
  return (
    <div className="app">
      <main className="stage" onWheel={onWheel}>
        <SceneLayer preset={scene} scene={sceneConfig} pan={cameraPan} scale={sceneScale}>
        <CameraLayer board={board} scene={sceneConfig} pan={{x: 0, y: 0}} sceneScale={sceneScale}>
          <Board
            width={board.width}
            height={board.height}
            frameStyle={sceneConfig.frame_style}
            title={board.title}
            subtitle={board.subtitle}
            onTitleChange={(e) => setBoard({ ...board, title: e.target.value })}
            onTitleBlur={(e) => saveBoard({ title: e.target.value })}
            onSubtitleChange={(e) => setBoard({ ...board, subtitle: e.target.value })}
            onSubtitleBlur={(e) => saveBoard({ subtitle: e.target.value })}
            onPointerDown={(e) => {
              if (tool !== "select" || (e.target !== e.currentTarget && !e.target.closest(".draw"))) return;
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
            onPointerCancel={() => (panDrag.current = null)}
          >
            <DrawLayer
              strokes={strokes}
              tool={tool}
              onDraw={draw}
              zoom={sceneScale}
              width={board.width}
              height={board.height}
            />
            {notes.map((n) => (
              <Note
                key={n.id}
                n={n}
                zoom={sceneScale}
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
      <div className="toolbar">
        <button className="new" onClick={() => setOpen(true)}>
          ＋ New note
        </button>
        <button
          onClick={async () => {
            const last = strokes.at(-1);
            if (last?.id) {
              try {
                await api("/strokes/" + last.id, { method: "DELETE" });
                setStrokes((x) => x.slice(0, -1));
              } catch {
                setConflict(true);
              }
            }
          }}
        >
          ↶ Undo
        </button>
        <button onClick={async () => { const preset = scene === "window" ? "sunset" : "window"; setScene(preset); try { const next = await api("/scene", { method: "PUT", body: JSON.stringify({ ...sceneConfig, preset, version: sceneConfig.version }) }); setSceneConfig(next); } catch { setConflict(true); } }}>
          Scene: {scene}
        </button>
        <button onClick={() => updateScene({ scene_width: Math.max(board.width + 20000, sceneConfig.scene_width - 10000) })}>Scene W−</button>
        <button onClick={() => updateScene({ scene_width: sceneConfig.scene_width + 10000 })}>Scene W＋</button>
        <button onClick={() => updateScene({ scene_height: Math.max(board.height + 20000, sceneConfig.scene_height - 10000) })}>Scene H−</button>
        <button onClick={() => updateScene({ scene_height: sceneConfig.scene_height + 10000 })}>Scene H＋</button>
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
        {marker && (
          <div className="marker-pop">
            <b>Pick a marker</b>
            {colors.map((c) => (
              <button
                key={c}
                className={"cap " + c}
                onClick={() => {
                  setTool("pen");
                  setMarker(false);
                }}
              >
                {c}
              </button>
            ))}
            <button
              className="eraser"
              onClick={() => {
                setTool("eraser");
                setMarker(false);
              }}
            >
              Eraser
            </button>
          </div>
        )}
      </div>
      <div className="controls">
        <span>Width</span>
        <button onClick={() => setWidthPct(Math.max(25, widthPct - 10))}>
          −
        </button>
        <b>{widthPct}%</b>
        <button onClick={() => setWidthPct(Math.min(maxWidthPct, widthPct + 10))} disabled={widthPct >= maxWidthPct}>
          ＋
        </button>
        <span>Height</span>
        <button onClick={() => setHeightPct(Math.max(25, heightPct - 10))}>−</button>
        <b>{heightPct}%</b>
        <button onClick={() => setHeightPct(Math.min(maxHeightPct, heightPct + 10))} disabled={heightPct >= maxHeightPct}>＋</button>
        <i />
        <span>Zoom</span>
        <button onClick={() => setZoom(Math.max(0.45, zoom - 0.1))}>−</button>
        <b>{Math.round(zoom * 100)}%</b>
        <button onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}>＋</button>
      </div>
      {open && (
        <div className="dialog">
          <form className="modal" onSubmit={add}>
            <h2>Add a little note</h2>
            <input
              autoFocus
              placeholder="A short title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              placeholder="What's on your mind?"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <select
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            >
              {colors.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <div className="row">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="primary">Pin it</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
