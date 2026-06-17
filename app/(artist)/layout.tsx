import { ArtistNav } from '@/components/nav/ArtistNav'

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav />
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
