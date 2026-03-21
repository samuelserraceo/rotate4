'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getRank } from '@/lib/ranks'
import type { Profile, Friendship, GameInvite } from '@/types'

type FriendRow = Friendship & { other?: Profile }
type RequestRow = Friendship & { requester?: Profile }

export default function LobbyPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [friends, setFriends]         = useState<FriendRow[]>([])
  const [requests, setRequests]       = useState<RequestRow[]>([])
  const [invites, setInvites]         = useState<GameInvite[]>([])
  const [friendRequest, setFriendRequest] = useState('')
  const [frStatus, setFrStatus]       = useState<string | null>(null)
  const [activeTab, setActiveTab]     = useState<'play' | 'friends'>('play')
  const [joiningCode, setJoiningCode] = useState('')
  const [eloTab, setEloTab]           = useState<'1v1' | '4p'>('1v1')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!p) { router.push('/onboarding'); return }
      if (mounted) setProfile(p)

      // Load accepted friends
      const { data: fs } = await supabase
        .from('friendships')
        .select('*, requester:requester_id(id,username,elo_1v1,elo_4p,games_played,games_won), addressee:addressee_id(id,username,elo_1v1,elo_4p,games_played,games_won)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')

      if (mounted && fs) setFriends(fs.map((f: Friendship & { requester?: Profile; addressee?: Profile }) => ({
        ...f,
        other: f.requester_id === user.id ? f.addressee : f.requester,
      })))

      // Load incoming pending friend requests (sent TO me)
      const { data: reqs } = await supabase
        .from('friendships')
        .select('*, requester:requester_id(id,username,elo_1v1,elo_4p)')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')

      if (mounted && reqs) setRequests(reqs as RequestRow[])

      // Load pending game invites (to me)
      const { data: gi } = await supabase
        .from('game_invites')
        .select('*, from_profile:from_profile_id(username), games(*)')
        .eq('to_profile_id', user.id)
        .eq('status', 'pending')

      if (mounted && gi) setInvites(gi)
      if (mounted) setLoading(false)
    }

    load()

    // Subscribe to incoming game invites
    let userId: string
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      userId = user.id
      supabase.channel('lobby-invites')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'game_invites',
          filter: `to_profile_id=eq.${userId}`,
        }, (payload) => {
          if (mounted) setInvites(prev => [...prev, payload.new as GameInvite])
        })
        .subscribe()
    })

    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const createHostedGame = async (mode: 'hosted_1v1' | 'hosted_4p') => {
    if (!profile) return
    const maxPlayers = mode === 'hosted_4p' ? 4 : 2
    const code = Math.random().toString(36).substring(2, 7).toUpperCase()
    const { data: game } = await supabase.from('games').insert({
      mode, host_id: profile.id, join_code: code, max_players: maxPlayers, status: 'waiting',
    }).select().single()
    if (!game) return
    await supabase.from('game_players').insert({
      game_id: game.id, profile_id: profile.id, symbol: 'X', player_index: 0,
    })
    router.push(`/game/${game.id}`)
  }

  const joinWithCode = async () => {
    if (!profile || !joiningCode.trim()) return
    const { data: game } = await supabase
      .from('games')
      .select('*, game_players(*)')
      .eq('join_code', joiningCode.trim().toUpperCase())
      .eq('status', 'waiting')
      .single()
    if (!game) { alert('Game not found or already started.'); return }
    const existing = (game.game_players as {profile_id:string}[]).find(p => p.profile_id === profile.id)
    if (existing) { router.push(`/game/${game.id}`); return }
    if (game.game_players.length >= game.max_players) { alert('Game is full.'); return }

    const symbols = ['X','O','W','M']
    const usedSymbols = (game.game_players as {symbol:string}[]).map(p => p.symbol)
    const nextSymbol = symbols.find(s => !usedSymbols.includes(s)) ?? 'O'
    const nextIndex = game.game_players.length

    await supabase.from('game_players').insert({
      game_id: game.id, profile_id: profile.id, symbol: nextSymbol, player_index: nextIndex,
    })

    if (nextIndex + 1 >= game.max_players) {
      await supabase.from('games').update({ status: 'active' }).eq('id', game.id)
    }
    router.push(`/game/${game.id}`)
  }

  const enterMatchmaking = async (mode: '1v1' | '4p') => {
    if (!profile) return
    const elo = mode === '1v1'
      ? (profile.elo_1v1 ?? profile.elo ?? 1200)
      : (profile.elo_4p ?? profile.elo ?? 1200)
    await supabase.from('matchmaking_queue').delete().eq('profile_id', profile.id)
    await supabase.from('matchmaking_queue').insert({
      profile_id: profile.id, mode, game_type: 'competitive', elo,
    })
    router.push(`/matchmaking?mode=${mode}`)
  }

  const sendFriendRequest = async () => {
    if (!profile || !friendRequest.trim()) return
    setFrStatus(null)
    const { data: target } = await supabase
      .from('profiles').select('id').eq('username', friendRequest.trim()).single()
    if (!target) { setFrStatus('User not found.'); return }
    if (target.id === profile.id) { setFrStatus("You can't add yourself."); return }
    const { error } = await supabase.from('friendships').insert({
      requester_id: profile.id, addressee_id: target.id,
    })
    if (error) { setFrStatus('Already friends or request already sent.'); return }
    setFrStatus('Friend request sent!')
    setFriendRequest('')
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

  const acceptInvite = async (invite: GameInvite) => {
    await supabase.from('game_invites').update({ status: 'accepted' }).eq('id', invite.id)
    setInvites(prev => prev.filter(i => i.id !== invite.id))
    router.push(`/game/${invite.game_id}`)
  }

  const declineInvite = async (inviteId: string) => {
    await supabase.from('game_invites').update({ status: 'declined' }).eq('id', inviteId)
    setInvites(prev => prev.filter(i => i.id !== inviteId))
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
      {/* Top nav */}
      <nav className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h1 className="text-xl font-black text-neon-cyan text-glow-cyan">
          ROTATE<span className="text-neon-purple text-glow-purple">4</span>
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={handleSignOut} className="btn-ghost text-xs">Sign out</button>
        </div>
      </nav>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Profile bar */}
        {profile && (
          <div className="card flex items-center justify-between">
            <div>
              <p className="font-bold text-white">{profile.username}</p>
              <p className="text-xs text-slate-500">{profile.games_played} games played</p>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-xs text-slate-500 uppercase">1v1 ELO</p>
                <p className="font-bold text-neon-cyan text-glow-cyan">{profile.elo_1v1 ?? profile.elo}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">4P ELO</p>
                <p className="font-bold text-neon-purple">{profile.elo_4p ?? profile.elo}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase">Coins</p>
                <p className="font-bold text-neon-amber text-glow-amber">{profile.coins}</p>
              </div>
            </div>
          </div>
        )}

        {/* Incoming game invites */}
        {invites.length > 0 && (
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="card border-neon-purple/20 flex items-center justify-between gap-3 animate-slide-in">
                <p className="text-sm text-slate-300">
                  <span className="text-neon-purple font-semibold">
                    {(inv as GameInvite & { from_profile?: { username: string } }).from_profile?.username ?? 'Someone'}
                  </span>{' '}
                  invited you to a game!
                </p>
                <div className="flex gap-2">
                  <button onClick={() => acceptInvite(inv)} className="btn-primary text-xs px-3 py-1.5">Join</button>
                  <button onClick={() => declineInvite(inv.id)} className="btn-ghost text-xs px-3 py-1.5">Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-white/5">
          <button
            onClick={() => setActiveTab('play')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'play' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-500 hover:text-white'}`}
          >
            Play
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${activeTab === 'friends' ? 'bg-neon-purple/10 text-neon-purple' : 'text-slate-500 hover:text-white'}`}
          >
            Friends {friends.length > 0 && <span className="ml-1 opacity-60">({friends.length})</span>}
          </button>
        </div>

        {/* PLAY TAB */}
        {activeTab === 'play' && (
          <div className="space-y-4 animate-fade-in">
            {/* Ranked Matchmaking */}
            <div>
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">Ranked</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => enterMatchmaking('1v1')} className="card border-neon-cyan/10 hover:border-neon-cyan/30 transition-all text-center py-5 group">
                  <p className="text-2xl mb-1">⚔️</p>
                  <p className="font-semibold text-slate-200 group-hover:text-neon-cyan transition-colors text-sm">1v1 Ranked</p>
                  <p className="text-xs text-slate-500 mt-1">ELO matchmaking</p>
                </button>
                <button onClick={() => enterMatchmaking('4p')} className="card border-neon-purple/10 hover:border-neon-purple/30 transition-all text-center py-5 group">
                  <p className="text-2xl mb-1">🏟️</p>
                  <p className="font-semibold text-slate-200 group-hover:text-neon-purple transition-colors text-sm">4P Ranked</p>
                  <p className="text-xs text-slate-500 mt-1">ELO matchmaking</p>
                </button>
              </div>
            </div>

            {/* Host a game */}
            <div>
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">Host (No Rewards)</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => createHostedGame('hosted_1v1')} className="card border-white/5 hover:border-white/20 transition-all text-center py-4 group">
                  <p className="text-xl mb-1">🏠</p>
                  <p className="font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">Host 1v1</p>
                  <p className="text-xs text-slate-600 mt-1">Private room</p>
                </button>
                <button onClick={() => createHostedGame('hosted_4p')} className="card border-white/5 hover:border-white/20 transition-all text-center py-4 group">
                  <p className="text-xl mb-1">🏠</p>
                  <p className="font-semibold text-slate-300 group-hover:text-white transition-colors text-sm">Host 4P</p>
                  <p className="text-xs text-slate-600 mt-1">Private room</p>
                </button>
              </div>
            </div>

            {/* Join by code */}
            <div className="card">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Join with code</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1 uppercase tracking-widest font-bold"
                  placeholder="XXXXX"
                  value={joiningCode}
                  onChange={e => setJoiningCode(e.target.value.toUpperCase())}
                  maxLength={5}
                />
                <button onClick={joinWithCode} className="btn-secondary px-4">Join</button>
              </div>
            </div>

            {/* Ranks */}
            <button onClick={() => router.push('/ranks')} className="card border-yellow-500/10 hover:border-yellow-500/30 transition-all text-center py-4 group w-full">
              <p className="text-2xl mb-1">🏆</p>
              <p className="font-semibold text-slate-200 group-hover:text-yellow-400 transition-colors text-sm">View Ranks</p>
              <p className="text-xs text-slate-500 mt-1">See the rank road</p>
            </button>

            {/* ELO Rank Bar */}
            {profile && (() => {
              const curElo = eloTab === '1v1'
                ? (profile.elo_1v1 ?? profile.elo ?? 1200)
                : (profile.elo_4p ?? profile.elo ?? 1200)
              const rank = getRank(curElo)
              return (
                <div className="card border-white/5 space-y-3">
                  <div className="flex gap-2">
                    <button onClick={() => setEloTab('1v1')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${eloTab === '1v1' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-slate-600 hover:text-slate-400'}`}
                    >⚔️ 1v1</button>
                    <button onClick={() => setEloTab('4p')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${eloTab === '4p' ? 'bg-neon-purple/10 text-neon-purple' : 'text-slate-600 hover:text-slate-400'}`}
                    >🏟️ 4P</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: rank.bgColor, border: `1px solid ${rank.color}40` }}>
                      {rank.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <p className="font-bold text-sm" style={{ color: rank.color }}>{rank.divisionName}</p>
                        <p className="text-xs text-slate-500 font-mono">{curElo} ELO</p>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${rank.progress * 100}%`,
                            background: `linear-gradient(90deg, ${rank.color}60, ${rank.color})`,
                            boxShadow: `0 0 6px ${rank.color}80`,
                          }} />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-xs text-slate-700">{rank.divisionMin}</span>
                        <span className="text-xs text-slate-700">{rank.divisionMax}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Shop & Leaderboard */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => router.push('/leaderboard')}
                className="card border-neon-amber/10 hover:border-neon-amber/30 transition-all text-center py-5 group">
                <p className="text-3xl mb-2">🏆</p>
                <p className="font-semibold text-slate-200 group-hover:text-neon-amber transition-colors">Leaderboard</p>
                <p className="text-xs text-slate-500 mt-1">Top ranked players</p>
              </button>
              <button onClick={() => router.push('/shop')}
                className="card border-neon-green/10 hover:border-neon-green/30 transition-all text-center py-5 group">
                <p className="text-3xl mb-2">🎨</p>
                <p className="font-semibold text-slate-200 group-hover:text-neon-green transition-colors">Shop</p>
                <p className="text-xs text-slate-500 mt-1">Skins & cosmetics</p>
              </button>
            </div>
          </div>
        )}

        {/* FRIENDS TAB */}
        {activeTab === 'friends' && (
          <div className="space-y-4 animate-fade-in">
            {/* Add friend */}
            <div className="card">
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Add Friend</h2>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Enter username…"
                  value={friendRequest}
                  onChange={e => setFriendRequest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFriendRequest()}
                />
                <button onClick={sendFriendRequest} className="btn-primary px-4">Send</button>
              </div>
              {frStatus && (
                <p className={`text-xs mt-2 ${frStatus.includes('sent') ? 'text-neon-green' : 'text-red-400'}`}>
                  {frStatus}
                </p>
              )}
            </div>

            {/* Friend Requests */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
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
                          <p className="text-white text-sm font-semibold">{u?.username ?? '...'}</p>
                          <p className="text-slate-500 text-xs">1v1 ELO: {u?.elo_1v1 ?? '—'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptRequest(req)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 hover:bg-neon-cyan/20 transition-colors font-semibold"
                          >Accept</button>
                          <button
                            onClick={() => declineRequest(req.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-500 border border-white/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                          >Decline</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Friends list */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Friends</h2>
                <span className="text-xs text-slate-600">{friends.length}</span>
              </div>
              {friends.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-4">No friends yet — add someone above!</p>
              ) : (
                <div className="space-y-3">
                  {friends.map(f => {
                    const u = f.other
                    return (
                      <div key={f.id} className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
                        <div>
                          <p className="text-white text-sm font-semibold">{u?.username ?? '...'}</p>
                          <p className="text-slate-500 text-xs">
                            1v1 ELO: {u?.elo_1v1 ?? '—'} · {u?.games_played ?? 0} games
                          </p>
                        </div>
                        <button
                          onClick={() => removeFriend(f.id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                        >Remove</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
