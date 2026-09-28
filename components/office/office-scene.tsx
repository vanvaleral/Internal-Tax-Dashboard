"use client";

type Point = { x: number; y: number };
type Avatar = { id: string; name: string; color: string; x: number; y: number; bubble?: string; mine?: boolean };
const colors: Record<string, string> = { teal: "#2cae9d", blue: "#5689d8", coral: "#e78777", violet: "#9a79d3", gold: "#daa957" };
const decorations: Record<string, string> = { plant: "🪴", lamp: "💡", books: "📚", coffee: "☕" };
const iso = (x: number, y: number): Point => ({ x: 500 + (x - y) * 31, y: 180 + (x + y) * 15 });
const tile = (x: number, y: number) => [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)].map(p => `${p.x},${p.y}`).join(" ");

function Character({ avatar }: { avatar: Avatar }) {
  const at = iso(avatar.x + .5, avatar.y + .5);
  return <g transform={`translate(${at.x} ${at.y})`} className="office-character">
    <ellipse cy="4" rx="19" ry="8" fill="#314b52" opacity=".22" />
    <path d="M-11 -14 L11 -14 L15 1 L-15 1Z" fill={colors[avatar.color] || colors.teal} stroke="#354155" strokeWidth="2" />
    <path d="M-7 -12 L-8 1 M7 -12 L8 1" stroke="#f0bd94" strokeWidth="4" />
    <rect x="-12" y="-38" width="24" height="25" rx="8" fill="#f2c49f" stroke="#354155" strokeWidth="2" />
    <path d="M-13 -31 Q-16 -50 0 -49 Q17 -48 14 -30 L9 -37 L-10 -36Z" fill="#333747" />
    <path d="M-7 -28 h3 m9 0 h3" stroke="#354155" strokeWidth="3" /><path d="M-2 -20 q3 3 6 0" fill="none" stroke="#af665f" strokeWidth="1.5" />
    {avatar.mine && <path d="M-6 -56 L0 -65 L6 -56Z" fill="#ffe078" stroke="#99764a" strokeWidth="2" />}
    <rect x="-48" y="14" width="96" height="21" rx="9" fill={avatar.mine ? "#ffe398" : "#fff8ea"} stroke="#596374" strokeWidth="2" />
    <text y="29" textAnchor="middle" fontSize="11" fontWeight="800" fill="#344458">{avatar.name.slice(0, 15)}{avatar.mine ? " • kamu" : ""}</text>
    {avatar.bubble && <g transform="translate(0 -81)"><rect x="-73" y="-23" width="146" height="37" rx="9" fill="#fffdf5" stroke="#596779" strokeWidth="2" /><path d="M-7 13 L0 21 L7 13" fill="#fffdf5" stroke="#596779" strokeWidth="2" /><text textAnchor="middle" y="0" fontSize="10" fontWeight="700" fill="#405165">{avatar.bubble.slice(0, 23)}{avatar.bubble.length > 23 ? "…" : ""}</text></g>}
  </g>;
}

export function OfficeScene({ avatars, decoration, gameEnabled, onMove, onGame }: { avatars: Avatar[]; decoration: string; gameEnabled: boolean; onMove: (x: number, y: number) => void; onGame: () => void }) {
  return <svg className="office-scene" viewBox="0 0 1000 610" role="img" aria-label="Ruang kantor virtual dengan karakter dan furnitur">
    <defs>
      <linearGradient id="office-sky" x2="0" y2="1"><stop stopColor="#a5d9e9" /><stop offset="1" stopColor="#e4f6dd" /></linearGradient>
      <pattern id="office-grass" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#8ac687" /><path d="M5 9 l3 -5 M24 21 l3 -5" stroke="#67aa70" strokeWidth="2" /></pattern>
    </defs>
    <rect width="1000" height="610" fill="url(#office-sky)" />
    <path d="M0 300 Q170 236 305 301 Q480 245 632 290 Q802 215 1000 310 V610 H0Z" fill="#82c389" />
    <path d="M0 345 Q190 270 340 356 Q525 298 735 345 Q866 315 1000 375 V610 H0Z" fill="url(#office-grass)" />
    <g fill="#fff" opacity=".85"><ellipse cx="137" cy="83" rx="58" ry="17" /><ellipse cx="114" cy="69" rx="30" ry="22" /><ellipse cx="825" cy="95" rx="67" ry="19" /></g>
    <path d="M500 -20 L252 100 L252 300 L500 180Z" fill="#f6deb1" stroke="#866b63" strokeWidth="6" />
    <path d="M500 -20 L872 160 L872 360 L500 180Z" fill="#fff0cc" stroke="#866b63" strokeWidth="6" />
    <path d="M252 300 L500 180 L872 360 L624 480Z" fill="#ba916b" stroke="#795c59" strokeWidth="8" />
    {Array.from({ length: 8 }, (_, y) => Array.from({ length: 12 }, (_, x) => <polygon key={`${x}-${y}`} points={tile(x, y)} fill={(x + y) % 2 ? "#ead6ae" : "#f5e6c6"} stroke="#d9bf98" strokeWidth="1" className="office-floor-tile" onClick={() => onMove(x, y)}><title>{`Berjalan ke petak ${x + 1}, ${y + 1}`}</title></polygon>))}
    <path d="M300 116 L392 71 L392 178 L300 223Z" fill="#9bd2dd" stroke="#715b5f" strokeWidth="8" /><path d="M346 93 V201 M300 167 L392 122" stroke="#715b5f" strokeWidth="6" />
    <path d="M694 72 L814 130 L814 231 L694 173Z" fill="#a8d7df" stroke="#715b5f" strokeWidth="8" /><path d="M754 101 V202" stroke="#715b5f" strokeWidth="6" />
    <path d="M459 64 L537 101 L537 159 L459 122Z" fill="#fffaf0" stroke="#876b63" strokeWidth="6" /><text x="474" y="107" fontSize="22" fontWeight="900" fill="#528c82" transform="rotate(24 474 107)">LMATS</text>
    <path d="M311 306 L473 227 L635 304 L472 383Z" fill="#b5d5c7" opacity=".9" />
    <path d="M388 305 L445 278 L540 323 L484 351Z" fill="#c98169" stroke="#7b565b" strokeWidth="5" /><path d="M388 305 V334 L484 380 V351 M484 351 L540 323 V351 L484 380" fill="#aa655c" stroke="#7b565b" strokeWidth="4" /><path d="M410 306 L445 288 L516 324 L482 340Z" fill="#f3a17e" />
    <g transform="translate(322 266)"><ellipse cy="0" rx="22" ry="13" fill="#805a53" /><path d="M-20 -4 Q-20 -31 0 -34 Q22 -31 22 -4Z" fill="#b98469" /><path d="M-20 3 V31 L0 42 V13 M0 13 L20 3 V31 L0 42" fill="#936755" /></g>
    <g transform="translate(720 300)"><path d="M-47 0 L0 -25 L54 2 L7 27Z" fill="#d2a96d" stroke="#765a55" strokeWidth="4" /><path d="M-47 0 V30 L7 56 V27 M7 27 L54 2 V32 L7 56" fill="#ab765a" stroke="#765a55" strokeWidth="4" /><path d="M-18 -8 L0 -18 L29 -4 L9 6Z" fill="#506976" /><path d="M9 6 L29 -4 V15 L9 25Z" fill="#314b58" /><path d="M-24 3 L0 17 L16 10" fill="none" stroke="#fff5d7" strokeWidth="6" /></g>
    <g transform="translate(802 352)"><path d="M-28 -65 L4 -79 L29 -67 L-4 -52Z" fill="#769c71" /><path d="M-28 -65 V12 L-4 24 V-52 M-4 -52 L29 -67 V10 L-4 24" fill="#60805f" /><path d="M-24 -40 L23 -61 M-24 -13 L23 -34" stroke="#e9d7a6" strokeWidth="5" /><rect x="-17" y="-47" width="8" height="21" fill="#d98570" /><rect y="-55" width="9" height="23" fill="#78b6b2" /></g>
    <g transform="translate(355 348)"><path d="M-18 4 L0 -5 L18 4 L0 14Z" fill="#b28362" /><path d="M-18 4 V21 L0 31 V14 M0 14 L18 4 V21 L0 31" fill="#906950" /><path d="M-13 1 Q-34 -14 -21 -30 Q-12 -38 -5 -22 Q-1 -49 15 -36 Q36 -19 12 -4Z" fill="#499f70" stroke="#327d5e" strokeWidth="4" /></g>
    <g transform="translate(623 407)"><path d="M-18 4 L0 -5 L18 4 L0 14Z" fill="#bd8664" /><path d="M-18 4 V23 L0 31 V14 M0 14 L18 4 V23 L0 31" fill="#9e654e" /><text y="-11" textAnchor="middle" fontSize="34">{decorations[decoration] || "🪴"}</text></g>
    <g className={gameEnabled ? "office-scene-game" : ""} role={gameEnabled ? "button" : undefined} tabIndex={gameEnabled ? 0 : undefined} onClick={gameEnabled ? onGame : undefined} onKeyDown={event => { if (gameEnabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onGame(); } }} transform="translate(650 314)"><path d="M-40 12 L0 -8 L48 15 L8 37Z" fill="#487d78" stroke="#36515a" strokeWidth="5" /><path d="M-40 12 V29 L8 54 V37 M8 37 L48 15 V34 L8 54" fill="#346b68" stroke="#36515a" strokeWidth="4" /><path d="M-13 -24 L8 -34 L29 -24 L8 -14Z" fill="#f2c76e" stroke="#65717a" strokeWidth="2" /><path d="M-10 -16 L10 -26 L30 -16 L9 -6Z" fill="#fff6dc" stroke="#65717a" strokeWidth="2" /><text y="77" textAnchor="middle" fontSize="13" fontWeight="900" fill="#2d5e59">{gameEnabled ? "✦ MAIN SUSUN BERKAS" : "MEJA ARSIP"}</text></g>
    {avatars.slice().sort((a, b) => a.x + a.y - b.x - b.y).map(avatar => <Character key={avatar.id} avatar={avatar} />)}
    <path d="M252 300 L624 480 L872 360" fill="none" stroke="#886c5d" strokeWidth="10" strokeLinecap="round" />
    <g fill="#4c9a65"><circle cx="220" cy="429" r="25" /><circle cx="198" cy="445" r="18" /><circle cx="907" cy="450" r="30" /><circle cx="932" cy="461" r="18" /></g>
  </svg>;
}
