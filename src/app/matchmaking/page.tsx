import { Suspense } from 'react'
import MatchmakingClient from './MatchmakingClient'

export const dynamic = 'force-dynamic'

export default function MatchmakingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Finding match...</div>}>
      <MatchmakingClient />
    </Suspense>
  )
}
