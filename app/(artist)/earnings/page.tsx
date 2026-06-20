import { Topbar } from '@/components/layout/Topbar'
import { DsrImport } from '@/components/earnings/DsrImport'

export const dynamic = 'force-dynamic'

// Earnings is a structural placeholder until partner royalty feeds exist
// (Songtrust mechanical/performance, ReRight sync/library — see task #8).
// All figures here are clearly labelled illustrative so nothing reads as
// real money. When a partner connects, swap these for live ledger data.

const SOURCES = [
  { label: 'Mechanical', via: 'via Songtrust → The MLC', amount: '$1,240', pct: 46 },
  { label: 'Performance', via: 'via your PRO', amount: '$880', pct: 33 },
  { label: 'Sync & Library', via: 'via ReRight', amount: '$560', pct: 21 },
]

const PARTNERS = [
  { name: 'Songtrust', role: 'Mechanical + performance collection, worldwide' },
  { name: 'ReRight', role: 'Direct sync & commercial-library deals' },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-hair bg-card p-6">
      <div className="text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">{label}</div>
      <div className="mtext tnum mt-2 text-[34px] font-black tracking-[-.02em]">{value}</div>
      <div className="mt-1 text-[12px] font-semibold text-lavdim">Illustrative</div>
    </div>
  )
}

export default function EarningsPage() {
  return (
    <>
      <Topbar
        title="Earnings"
        subtitle="Royalties collected across your partners — mechanical, performance, sync & library"
      />
      <div className="flex-1 px-9 py-[30px]">
        {/* Real earnings via DSR import */}
        <DsrImport />

        {/* Honest illustrative banner */}
        <div className="mb-7 flex items-center gap-[14px] rounded-[14px] border border-money/30 bg-money/10 px-5 py-4">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] flex-none" fill="none" stroke="#F59E0B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5m0 3h.01" />
          </svg>
          <div className="text-[14px] font-semibold text-white">
            <b className="text-money2">Illustrative preview.</b> Connect Songtrust or ReRight to see your
            real royalty earnings here. Numbers below are samples, not actual income.
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Stat label="Total collected" value="$2,680" />
          <Stat label="This month" value="$420" />
          <Stat label="Pending" value="$310" />
        </div>

        {/* Breakdown by source */}
        <div className="mt-7 rounded-card border border-hair bg-card p-6">
          <div className="mb-5 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">
            By source
          </div>
          <div className="space-y-5">
            {SOURCES.map(s => (
              <div key={s.label}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[15px] font-bold text-white">
                    {s.label} <span className="text-[12.5px] font-medium text-lavdim">· {s.via}</span>
                  </span>
                  <span className="mtext tnum text-[15px] font-extrabold">{s.amount}</span>
                </div>
                <div className="h-[8px] overflow-hidden rounded-full bg-[rgba(199,203,247,.12)]">
                  <div className="h-full rounded-full bg-grad-money" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Connected partners */}
        <div className="mt-7">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-[.14em] text-lavdim">
            Collection partners
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {PARTNERS.map(p => (
              <div key={p.name} className="flex items-center justify-between rounded-card border border-hair bg-card p-5">
                <div>
                  <div className="text-[16px] font-bold text-white">{p.name}</div>
                  <div className="mt-1 text-[13px] text-lavdim">{p.role}</div>
                </div>
                <span className="rounded-full border border-hairstrong bg-card2 px-3 py-[6px] text-[12.5px] font-bold text-lavdim">
                  Not connected
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
