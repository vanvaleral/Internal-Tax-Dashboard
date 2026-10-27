export function WorkspaceLoader() {
  return (
    <div className="workspace-boot" role="status" aria-live="polite" aria-busy="true">
      <style>{`
        .workspace-boot{position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;justify-items:center;gap:14px;background:rgba(240,242,238,.78);backdrop-filter:blur(10px);color:#35575d;font:13px "Segoe UI",sans-serif}
        .workspace-bars{display:flex;align-items:flex-end;gap:5px;height:30px}
        .workspace-bars i{display:block;width:5px;height:12px;border-radius:2px;background:#0891a6;transform-origin:bottom;animation:workspace-pulse 1.1s ease-in-out infinite}
        .workspace-bars i:nth-child(2){height:18px;animation-delay:120ms}.workspace-bars i:nth-child(3){height:24px;animation-delay:240ms}.workspace-bars i:nth-child(4){height:30px;animation-delay:360ms}
        @keyframes workspace-pulse{0%,100%{transform:scaleY(.6);opacity:.45}50%{transform:scaleY(1);opacity:1}}
        @media(prefers-reduced-motion:reduce){.workspace-bars i{animation:none}}
      `}</style>
      <span className="workspace-bars" aria-hidden="true"><i /><i /><i /><i /></span>
      <span>Loading workspace...</span>
    </div>
  );
}
