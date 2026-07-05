export function PlayerChip({ player }) {
  return (
    <div className="player-chip">
      <span className="dot" style={{ background: player.avatar_color }} />
      <span className="nm">{player.nickname}</span>
    </div>
  )
}

export function ColorPicker({ colors, value, onChange }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`เลือกสี ${c}`}
          className={'swatch' + (value === c ? ' sel' : '')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}
