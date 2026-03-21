'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Friendship } from '@/types'

type FriendRow   = Friendship & { other?: Profile }
type RequestRow  = Friendship & { requester?: Profile }

export default function FriendsPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [profile,   setProfile]   = useState<Profile | null>(null)
  const [friends,   setFriends]   = useState<FriendRow[]>([])
  const [requests,  setRequests]  = useState<RequestRow[]>([])
  const [search,    setSearch]    = useState('')
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!p) { router.push('/onboarding'); return }
      if (mounted) setProfile(p)

      // Accepted friends
      const { data: fs } = await supabase
        .from('friendships')
        .select('*, requester:requester_id(id,username,elo_1v1,elo_4p,games_played,games_won), addressee:addressee_id(id,username,elo_1v1,elo_4p,games_played,games_won)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')
      if (mounted && fs) {
        setFriends(fs.map((f: Friendship & { requester?: Profile; addressee?: Profile }) => ({
          ...f,
          other: f.requester_id === user.id ? f.addressee : f.requester,
        })))
      }

      // Incoming pending friend requests (sent TO me)
      const { data: reqs } = await supabase
        .from('friendships')
        .select('*, requester:requester_id(id,username,elo_1v1,elo_4p)')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
      if (mounted && reqs) setRequests(reqs as RequestRow[])

      if (mounted) setLoading(false)
    }
    load()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendRequest = async () => {
    if (!profile || !search.trim()) return
    setSearchMsg(null)
    const { data: target } = await supabase
      .from('profiles').select('id').eq('username', search.trim()).single()
    if (!target)          { setSearchMsg('User not found.'); return }
    if (target.id === profile.id) { setSearchMsg("You can't add yourself."); return }
    const { error } = await supabase.from('friendships').insert({
      requester_id: profile.id, addressee_id: target.id,
    })
    if (error) { setSearchMsg('Already friends or request already sent.'); return }
    setSearchMsg('Friend request sent!')
    setSearch('')
  }

  const acceptRequest = async (req: RequestRow) => {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', req.id)
    setRequests(prev => prev.filter(r => r.id !== req.id))
    if (req.requester) {
      setFriends(prev => [...prev, { ...req, other: req.requester, status: 'accepted' }])
    }
  }

  const declineRequest = async (reqId: string) => {
    await supabase.from('friendships').delete().eq('id', reqId)
    setRequests(prev => prev.filter(r => r.id !== reqId))
  }

  const removeFriend = async (friendshipId: string) => {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setFriends(prev => prev.filter(f => f.id !== friendshipId))
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-neon-cyan animate-pulse text-glow-cyan font-bold text-xl">
        ROTATE<span className="text-neon-purple">4</span>
      </p>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Lobby</button>
        <div className="text-center">
          <span className="text-neon-cyan text-glow-cyan font-bold text-lg">ROTATE</span>
          <span className="text-neon-purple text-glow-purple font-bold text-lg">4</span>
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-6">

        {/* Add friend */}
        <div className="card">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">Add Friend</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-neon-cyan/40"
              placeholder="Enter username…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendRequest()}
            />
            <button onClick={sendRequest} className="btn-primary px-4 text-sm">Send</button>
          </div>
          {searchMsg && (
            <p className={`mt-2 text-xs ${searchMsg.includes('sent') ? 'text-neon-cyan' : 'text-red-400'}`}>
              {searchMsg}
            </p>
          )}
        </div>

        {/* ── Section 1: Friend Requests ─────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Friend Requests</h2>
            {requests.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 font-bold">
                {requests.length}
              </span>
            )}
          </div>

          {requests.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {requests.map(req => {
                const u = req.requester as Profile | undefined
                return (
                  <div key={req.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
                    <div>
                      <p className="text-white text-sm font-semibold">{u?.username ?? '···'}</p>
                      <p className="text-slate-500 text-xs">
                        1v1 ELO: {u?.elo_1v1 ?? '—'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptRequest(req)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 hover:bg-neon-cyan/20 transition-colors font-semibold"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineRequest(req.id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-500 border border-white/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section 2: Friends ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Friends</h2>
            <span className="text-xs text-slate-600">{friends.length}</span>
          </div>

          {friends.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">No friends yet — add someone above</p>
          ) : (
            <div className="space-y-3">
              {friends.map(f => {
                const u = f.other
                return (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
                    <div>
                      <p className="text-white text-sm font-semibold">{u?.username ?? '···'}</p>
                      <p className="text-slate-500 text-xs">
                        1v1 ELO: {u?.elo_1v1 ?? '—'} · {u?.games_played ?? 0} games
                      </p>
                    </div>
                    <button
                      onClick={() => removeFriend(f.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
