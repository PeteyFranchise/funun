import type { PlaybookVideoConfig } from '@/lib/playbook/media'

export function PlaybookVideo({ video }: { video: PlaybookVideoConfig }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="aspect-video w-full bg-black">
        {video.provider === 'funun' ? (
          <video controls preload="metadata" playsInline className="h-full w-full" aria-label={video.title}>
            <source src={video.embedUrl} />
            Your browser cannot play this training video.
          </video>
        ) : (
          <iframe
            src={video.embedUrl}
            title={video.title}
            loading="lazy"
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
      </div>
      <figcaption className="px-4 py-3">
        <p className="text-[13px] font-extrabold text-[color:var(--ink)]">{video.title}</p>
        {video.caption && <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--ink-3)]">{video.caption}</p>}
        {video.transcript ? (
          <details className="mt-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-bold text-[color:var(--indigo)]">Read transcript</summary>
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-[color:var(--ink-2)]">{video.transcript}</p>
          </details>
        ) : (
          <p className="mt-2 text-[10.5px] font-bold text-amber-300">Transcript not supplied yet.</p>
        )}
      </figcaption>
    </figure>
  )
}
