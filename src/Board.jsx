import React, { forwardRef } from "react";

/**
 * Presentational board surface. Camera state and interaction ownership remain
 * with the embedding application; this component renders one `.board` node.
 */
const Board = forwardRef(function Board(
  {
    width,
    height,
    frameStyle,
    title,
    subtitle,
    onTitleChange,
    onTitleBlur,
    onSubtitleChange,
    onSubtitleBlur,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    children,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`board frame-${frameStyle}`}
      style={{ width, height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <input
        className="board-title"
        value={title}
        onChange={onTitleChange}
        onBlur={onTitleBlur}
      />
      <input
        className="board-subtitle"
        value={subtitle}
        onChange={onSubtitleChange}
        onBlur={onSubtitleBlur}
      />
      {children}
    </div>
  );
});

export default Board;
