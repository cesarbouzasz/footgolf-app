'use client';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <img
        src="/iconotransicion.png"
        alt="Cargando"
        className="h-28 w-28 animate-pulse"
      />
    </div>
  );
}
