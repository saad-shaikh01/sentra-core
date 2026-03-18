'use client';

const PALETTE = [
  'bg-blue-500/15 text-blue-300 border-blue-500/20',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/20',
  'bg-orange-500/15 text-orange-300 border-orange-500/20',
  'bg-pink-500/15 text-pink-300 border-pink-500/20',
  'bg-teal-500/15 text-teal-300 border-teal-500/20',
  'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
] as const;

function slugToColorIndex(slug: string): number {
  return slug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % PALETTE.length;
}

export function TeamTypeBadge({
  type,
}: {
  type: { name: string; slug: string };
}) {
  const colorClass = PALETTE[slugToColorIndex(type.slug)];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {type.name}
    </span>
  );
}
