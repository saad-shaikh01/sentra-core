'use client';

import { useEffect, useRef } from 'react';

interface SpotlightBackgroundProps {
  children: React.ReactNode;
}

export function SpotlightBackground({ children }: SpotlightBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      container.style.setProperty('--spotlight-x', `${x}%`);
      container.style.setProperty('--spotlight-y', `${y}%`);
    };

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen bg-background overflow-hidden"
      style={{
        '--spotlight-x': '50%',
        '--spotlight-y': '0%',
      } as React.CSSProperties}
    >
      {/* Spotlight gradient overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `
            radial-gradient(
              600px circle at var(--spotlight-x) var(--spotlight-y),
              rgba(99, 102, 241, 0.15),
              transparent 40%
            )
          `,
        }}
      />
      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
