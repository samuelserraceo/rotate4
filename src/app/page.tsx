'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Friendship, GameInvite, Game } from '@/types'

export default function LobbyPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [friends, setFriends]       = useState<(Friendship & { other?: Profile })[]>([])
  const [invites, setInvites]       = useState<GameInvite[]>([])
  const [friendRequest, setFriendRequest] = useState('')
  const [frStatus, setFrStatus]     = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<'play' | 'friends'>('play')
  const [hosting, setHosting]       = useState<{ code: string; gameId: string } | null>(null)
  const [joiningCode, setJoiningCode] = useState('')
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!p) { router.push('/onboarding'); return }
      if (mounted) setProfile(p)

      // Load friends
      const { data: fs } = await supabase
        .from('friendships')
        .select('*, requester:requester_id(id,username,elo), addressee:addressee_id(id,username,elo)')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted')
      if (mounted && fs) setFriends(fs.map((f: Friendship & { requester?: Profile; addressee?: Profile }) => ({
        ...f,
        other: f.requester_id === user.id ? f.addressee : f.requester,
      })))

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

  const createHostedGame = async (mode: 'casual_1v1' | 'casual_4p') => {
    if (!profile) return
    const code = Math.random().toString(36).substring(2, 7).toUpperCase()
    const { data: game } = await supabase.from('games').insert({
      mode, host_id: profile.id, join_code: code,
      max_players: mode === 'casual_4p' ? 4 : 2,
      status: 'waiting',
    }).select().single()
    if (!game) return

    await supabase.from('game_players').insert({
      game_id: game.id, profile_id: profile.id,
      symbol: 'X', player_index: 0,
    })
    setHosting({ code, gameId: game.id })
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
      game_id: game.id, profile_id: profile.id,
      symbol: nextSymbol, player_index: nextIndex,
    })

    // Start game if full
    if (nextIndex + 1 >= game.max_players) {
      await supabase.from('games').update({ status: 'active' }).eq('id', game.id)
    }

    router.push(`/game/${game.id}`)
  }

  const enterMatchmaking = async (mode: '1v1' | '4p', type: 'casual' | 'competitive') => {
    if (!profile) return
    // Remove from queue first (idempotent)
    await supabase.from('matchmaking_queue').delete().eq('profile_id', profile.id)
    await supabase.from('matchmaking_queue').insert({
      profile_id: profile.id, mode, game_type: type, elo: profile.elo,
    })
    router.push(`/matchmaking?mode=${mode}&type=${type}`)
  }

  const sendFriendRequest = async () => {
    if (!profile || !friendRequest.trim()) return
    setFrStatus(null)
    const { data: target } = await supabase
      .from('profiles').select('id').eq('username', friendRequest.trim()).single()
    if (!target) { setFrStatus('User not found.'); return }
    if (target.id === profile.id) { setFrStatus('You can\'t friend yourself.'); return }
    const { error } = await supabase.from('friendships').insert({
      requester_id: profile.id, addressee_id: target.id,
    })
    if (error) { setFrStatus('Already sent or already friends.'); return }
    setFrStatus('Friend request sent!')
    setFriendRequest('')
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
          <button onClick={() => router.push('/leaderboard')} className="btn-ghost text-xs">🏆 Leaderboard</button>
          <button onClick={() => router.push('/shop')} className="btn-ghost text-xs">🎨 Shop</button>
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
                <p className="text-xs text-slate-500 uppercase">ELO</p>
                <p className="font-bold text-neon-cyan text-glow-cyan">{profile.elo}</p>
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
            {/* Casual */}
            <div>
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">Casual</h3>
              <div className="grid grid-cols-2 gap-3">
                <ModeCard label="1v1" type="casual" onMatchmake={() => enterMatchmaking('1v1', 'casual')} onHost={() => createHostedGame('casual_1v1')} />
                <ModeCard label="4-Player" type="casual" onMatchmake={() => enterMatchmaking('4p', 'casual')} onHost={() => createHostedGame('casual_4p')} />
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

            {/* Competitive */}
            <div>
              <h3 className="text-xs text-slate-500 uppercase tracking-widest mb-2">Competitive (Ranked)</h3>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => enterMatchmaking('1v1', 'competitive')}
                  className="card border-neon-cyan/10 hover:border-neon-cyan/30 transition-all text-center py-4 group">
                  <p className="text-2xl mb-1">⚔️</p>
                  <p className="font-semibold text-slate-200 group-hover:text-neon-cyan transition-colors">1v1 Ranked</p>
                  <p className="text-xs text-slate-500 mt-1">ELO matchmaking</p>
                </button>
                <button onClick={() => enterMatchmaking('4p', 'competitive')}
                  className="card border-neon-purple/10 hover:border-neon-purple/30 transition-all text-center py-4 group">
                  <p className="text-2xl mb-1">🏟️</p>
                  <p className="font-semibold text-slate-200 group-hover:text-neon-purple transition-colors">4-Player Ranked</p>
                  <p className="text-xs text-slate-500 mt-1">ELO matchmaking</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FRIENDS TAB */}
        {activeTab === 'friends' && (
          <div className="space-y-4 animate-fade-in">
            {/* Add friend */}
            <div className="card">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Add Friend</p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Enter username…"
                  value={friendRequest}
                  onChange={e => setFriendRequest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFriendRequest()}
                />
                <button onClick={sendFriendRequest} className="btn-secondary px-4">Add</button>
              </div>
              {frStatus && (
                <p className={`text-xs mt-2 ${frStatus.includes('sent') ? 'text-neon-green' : 'text-red-400'}`}>
                  {frStatus}
                </p>
              )}
            </div>

            {/* Friends list */}
            {friends.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-6">No friends yet. Add someone above!</p>
            ) : (
              <div className="space-y-2">
                {friends.map(f => (
                  <div key={f.id} className="card flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white text-sm">{f.other?.username}</p>
                      <p className="text-xs text-slate-500">ELO: {f.other?.elo ?? '?'}</p>
                    </div>
                    <button
                      onClick={() => inviteFriendToGame(f.other!.id, profile!.id)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  async function inviteFriendToGame(friendId: string, hostId: string) {
    // Create a casual game and invite the friend
    const { data: game } = await supabase.from('games').insert({
      mode: 'casual_1v1', host_id: hostId,
      join_code: Math.random().toString(36).substring(2,7).toUpperCase(),
      max_players: 2, status: 'waiting',
    }).select().single()
    if (!game) return

    await supabase.from('game_players').insert({
      game_id: game.id, profile_id: hostId, symbol: 'X', player_index: 0,
    })
    await supabase.from('game_invites').insert({
      game_id: game.id, from_profile_id: hostId, to_profile_id: friendId,
    })
    router.push(`/game/${game.id}`)
  }
}

function ModeCard({ label, type, onMatchmake, onHost }: {
  label: string; type: 'casual'; onMatchmake: () => void; onHost: () => void
}) {
  return (
    <div className="card border-white/5 space-y-2">
      <p className="font-semibold text-slate-200 text-sm">{label}</p>
      <button onClick={onMatchmake} className="btn-secondary w-full text-xs py-2">
        🔍 Find Match
      </button>
      <button onClick={onHost} className="btn-ghost w-full text-xs py-2 border border-white/10">
        🏠 Host
      </button>
    </div>
  )
}
