"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceLoader } from "./workspace-loader";

export function DemoFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [starting, setStarting] = useState(true);
  function requestLoadingStatus() {
    try {
      const target = frame.current?.contentWindow?.location;
      if (target && ["/login", "/onboarding"].includes(target.pathname)) {
        window.location.replace(target.href);
        return;
      }
    } catch { /* The frame must stay same-origin to exchange workspace messages. */ }
    frame.current?.contentWindow?.postMessage({ type: "workspace:status" }, window.location.origin);
  }
  useEffect(() => {
    function mounted(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      // Hand over only once the child has its own first-paint loader, not on iframe load.
      if (event.data?.type === "dashboard:mounted") setStarting(false);
      if (event.data?.type === "dashboard:ready") {
        const timing = event.data.timing;
        const readyMs = Math.round(performance.now());
        (window as Window & { __workspaceStartupTiming?: unknown }).__workspaceStartupTiming = {
          readyMs, requestMs: Number(timing?.requestMs) || 0, server: timing?.server || {}
        };
        performance.mark("workspace:ready");
      }
    }
    window.addEventListener("message", mounted);
    requestLoadingStatus();
    return () => window.removeEventListener("message", mounted);
  }, []);
  return (
    <>
      {starting && <WorkspaceLoader />}
      <iframe
        ref={frame}
        onLoad={requestLoadingStatus}
        src="/demo.html?v=client-sorting-v4"
        title="Tax Dashboard"
        className="demo-frame w-full border-0"
      />
    </>
  );
}
