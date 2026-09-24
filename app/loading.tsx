export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <div className="page-loading-orbit"><img src="/favicon.svg" alt="" /></div>
      <span>Loading secure workspace...</span>
    </div>
  );
}
