import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
  const ref = useRef(null),
    drawing = useRef(null);
  useEffect(() => {
    const c = ref.current,
      ctx = c.getContext("2d");
    c.width = width;
    c.height = height;
    ctx.clearRect(0, 0, c.width, c.height);
    strokes
      .filter((s) => !s.deleted)
      .forEach((s) => {
        ctx.beginPath();
        s.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalCompositeOperation = s.erased
          ? "destination-out"
          : "source-over";
        ctx.stroke();
      });
    ctx.globalCompositeOperation = "source-over";
  }, [strokes, width, height]);
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  return (
    <canvas
      ref={ref}
      className="draw"
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
        const ctx = ref.current.getContext("2d");
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = tool === "eraser" ? "#fffdf8" : "#625276";
        ctx.lineWidth = tool === "eraser" ? 28 : 6;
        ctx.lineCap = "round";
        ctx.stroke();
      }}
      onPointerUp={() => {
        if (drawing.current) {
          onDraw(drawing.current, tool);
          drawing.current = null;
        }
      }}
    />
  );
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
    [boardPct, setBoardPct] = useState(100),
    [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight }),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [tool, setTool] = useState("select"),
    [marker, setMarker] = useState(false),
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
        const [b, ns, ss] = await Promise.all([
          api("/board").catch(() => board),
          api("/notes"),
          api("/strokes").catch(() => []),
        ]);
        setBoard(b);
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
  const scaled = boardPct / 100;
  const gutter = Math.min(192, Math.max(24, viewport.width * 0.15));
  const fit = Math.min(
    (viewport.width - gutter * 2) / (board.width * scaled + 36),
    (viewport.height - gutter * 2) / (board.height * scaled + 36),
  );
  const sceneScale = Math.min(1, fit) * zoom;
  const sceneWidth = (board.width * scaled + 36) * sceneScale;
  const sceneHeight = (board.height * scaled + 36) * sceneScale;
  const maxPanX = Math.max(0, (sceneWidth - (viewport.width - gutter * 2)) / 2);
  const maxPanY = Math.max(0, (sceneHeight - (viewport.height - gutter * 2)) / 2);
  const clampPan = (p) => ({
    x: Math.max(-maxPanX, Math.min(maxPanX, p.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, p.y)),
  });
  useEffect(() => setPan((p) => clampPan(p)), [boardPct, zoom, viewport, board.width, board.height]);
  return (
    <div className="app">
      <main className="stage">
        <section
          className="board-shell"
          style={{
            width: board.width * scaled,
            height: board.height * scaled,
            transform: `translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px)) scale(${sceneScale})`,
          }}
        >
          <div
            className="board"
            style={{
              width: board.width * scaled,
              height: board.height * scaled,
            }}
            onPointerDown={(e) => {
              if (tool !== "select" || e.target !== e.currentTarget) return;
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
            <input
              className="board-title"
              value={board.title}
              onChange={(e) => setBoard({ ...board, title: e.target.value })}
              onBlur={(e) => saveBoard({ title: e.target.value })}
            />
            <input
              className="board-subtitle"
              value={board.subtitle}
              onChange={(e) => setBoard({ ...board, subtitle: e.target.value })}
              onBlur={(e) => saveBoard({ subtitle: e.target.value })}
            />
            <DrawLayer
              strokes={strokes}
              tool={tool}
              onDraw={draw}
              zoom={sceneScale}
              width={board.width * scaled}
              height={board.height * scaled}
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
          </div>
        </section>
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
        <span>Board size</span>
        <button onClick={() => setBoardPct(Math.max(65, boardPct - 10))}>
          −
        </button>
        <b>{boardPct}%</b>
        <button onClick={() => setBoardPct(Math.min(140, boardPct + 10))}>
          ＋
        </button>
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
