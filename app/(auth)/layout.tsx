import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            ArtistOS
          </Link>
          <p className="mt-1 text-sm text-white/50">The operating system for your music career.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
