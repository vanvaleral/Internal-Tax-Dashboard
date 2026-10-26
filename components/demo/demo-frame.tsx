"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceLoader } from "./workspace-loader";

export function DemoFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [starting, setStarting] = useState(true);
  function requestLoadingStatus() {
    frame.current?.contentWindow?.postMessage({ type: "workspace:status" }, window.location.origin);
  }
  useEffect(() => {
    function mounted(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      // Hand over only once the child has its own first-paint loader, not on iframe load.
      if (event.data?.type === "dashboard:mounted") setStarting(false);
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
