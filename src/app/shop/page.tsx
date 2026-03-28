'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Skin, OwnedSkin } from '@/types'

export default function ShopPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile]       = useState<Profile | null>(null)
  const [skins, setSkins]           = useState<Skin[]>([])
  const [owned, setOwned]           = useState<string[]>([])   // owned skin IDs
  const [equipped, setEquipped]     = useState<string | null>(null)
  const [buying, setBuying]         = useState<string | null>(null)
  const [message, setMessage]       = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (mounted) { setProfile(p); setEquipped(p?.equipped_skin_id ?? null) }

      const { data: sk } = await supabase.from('skins').select('*').order('price')
      if (mounted) setSkins(sk ?? [])

      const { data: os } = await supabase.from('owned_skins').select('skin_id').eq('profile_id', user.id)
      if (mounted) setOwned((os ?? []).map((o: { skin_id: string }) => o.skin_id))
    }
    load()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBuy = async (skin: Skin) => {
    if (!profile) return
    if (profile.coins < skin.price) {
      setMessage({ text: 'Not enough coins!', ok: false }); return
    }
    setBuying(skin.id)

    const { error } = await supabase.from('owned_skins').insert({
      profile_id: profile.id, skin_id: skin.id,
    })
    if (error) { setMessage({ text: 'Purchase failed.', ok: false }); setBuying(null); return }

    await supabase.from('profiles').update({ coins: profile.coins - skin.price }).eq('id', profile.id)
    setProfile(prev => prev ? { ...prev, coins: prev.coins - skin.price } : prev)
    setOwned(prev => [...prev, skin.id])
    setMessage({ text: `✓ Purchased ${skin.name}!`, ok: true })
    setBuying(null)
    setTimeout(() => setMessage(null), 3000)
  }

  const handleEquip = async (skinId: string) => {
    if (!profile) return
    await supabase.from('profiles').update({ equipped_skin_id: skinId }).eq('id', profile.id)
    setEquipped(skinId)
    setMessage({ text: '✓ Skin equipped!', ok: true })
    setTimeout(() => setMessage(null), 2000)
  }

  const basicSkins   = skins.filter(s => s.price <= 500)
  const premiumSkins = skins.filter(s => s.price > 500 && s.price < 2000)
  const ultraSkins   = skins.filter(s => s.price >= 2000)

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.push('/')} className="btn-ghost text-sm">← Back</button>
          <h1 className="text-2xl font-black text-neon-cyan text-glow-cyan">🎨 Skin Shop</h1>
          <div className="card py-1.5 px-3 border-neon-amber/20">
            <span className="text-neon-amber font-bold text-sm">
              {profile?.coins ?? 0} <span className="text-xs text-slate-500">coins</span>
            </span>
          </div>
        </div>

        {/* Toast */}
        {message && (
          <div className={`card border mb-4 text-sm text-center animate-slide-in ${message.ok ? 'border-neon-green/30 text-neon-green' : 'border-red-500/30 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* How to earn */}
        <div className="card border-white/5 mb-6 text-xs text-slate-500">
          <p className="font-semibold text-slate-400 mb-2">How to earn coins</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Competitive Win</span><span className="text-neon-amber font-semibold">+150</span>
            <span>Competitive Loss</span><span className="text-neon-amber font-semibold">+30</span>
            <span>Casual Win</span><span className="text-neon-amber font-semibold">+75</span>
            <span>Casual Loss</span><span className="text-neon-amber font-semibold">+15</span>
          </div>
        </div>

        {/* Preview block */}
        <PreviewBlock equippedSkin={skins.find(s => s.id === equipped)} />

        {/* Basic skins */}
        <SkinSection title="Basic Colors" price="500 coins each" skins={basicSkins} owned={owned} equipped={equipped} buying={buying} onBuy={handleBuy} onEquip={handleEquip} />

        {/* Premium skins */}
        <SkinSection title="Premium Colors" price="1,500 coins each" skins={premiumSkins} owned={owned} equipped={equipped} buying={buying} onBuy={handleBuy} onEquip={handleEquip} />

        {/* Ultra skins */}
        {ultraSkins.length > 0 && (
          <div className="mb-8">
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400">Ultra Skins</h2>
              <span className="text-xs text-slate-600">2,000 coins each</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Custom artwork rendered on every piece during gameplay</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ultraSkins.map(skin => {
                const isOwned    = owned.includes(skin.id)
                const isEquipped = equipped === skin.id
                const isBuying   = buying === skin.id

                return (
                  <div
                    key={skin.id}
                    className="card border transition-all"
                    style={{ borderColor: isEquipped ? `${skin.color}60` : `${skin.color}20`, background: `${skin.color}08` }}
                  >
                    {/* Ultra swatch with shimmer */}
                    <div
                      className="w-full h-16 rounded-lg mb-3 flex items-center justify-center text-2xl font-black relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${skin.color}30, ${skin.glow_color}40, ${skin.color}20)`,
                        border: `2px solid ${skin.color}50`,
                        color: skin.color,
                        boxShadow: isEquipped ? `0 0 16px ${skin.glow_color}50, inset 0 0 12px ${skin.color}15` : `0 0 8px ${skin.glow_color}20`,
                      }}
                    >
                      <span style={{ textShadow: `0 0 10px ${skin.glow_color}` }}>X</span>
                    </div>

                    <p className="font-semibold text-sm truncate" style={{ color: skin.color }}>{skin.name}</p>
                    <p className="text-xs text-slate-500 mb-3 truncate">{skin.description}</p>

                    {isOwned ? (
                      <button
                        onClick={() => onEquip(skin.id)}
                        disabled={isEquipped}
                        className={`w-full text-xs py-1.5 rounded-lg font-semibold transition-all ${isEquipped ? 'border border-opacity-50' : 'btn-ghost border border-white/10'}`}
                        style={isEquipped ? { borderColor: skin.color, color: skin.color, background: `${skin.color}15` } : {}}
                      >
                        {isEquipped ? '✓ Equipped' : 'Equip'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onBuy(skin)}
                        disabled={!!buying}
                        className="w-full text-xs py-1.5 rounded-lg font-semibold transition-all border"
                        style={{ background: `${skin.color}15`, color: skin.color, borderColor: `${skin.color}40` }}
                      >
                        {isBuying ? '…' : `Buy · ${skin.price}`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewBlock({ equippedSkin }: { equippedSkin?: Skin }) {
  const color = equippedSkin?.color ?? '#00f5ff'
  return (
    <div className="card border-white/5 mb-6 flex items-center gap-4">
      <div className="text-xs text-slate-500 uppercase tracking-wider">Preview</div>
      <div className="flex gap-2">
        {(['X','O','W','M'] as const).map(sym => (
          <div
            key={sym}
            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm border-2"
            style={{
              color,
              borderColor: color,
              background: `${color}15`,
              boxShadow: `0 0 8px ${color}44`,
            }}
          >
            {sym}
          </div>
        ))}
      </div>
      <div className="ml-auto text-xs text-slate-600">
        {equippedSkin?.name ?? 'Default Cyan'}
      </div>
    </div>
  )
}

function SkinSection({ title, price, skins, owned, equipped, buying, onBuy, onEquip }: {
  title: string
  price: string
  skins: Skin[]
  owned: string[]
  equipped: string | null
  buying: string | null
  onBuy: (skin: Skin) => void
  onEquip: (id: string) => void
}) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-bold text-slate-200">{title}</h2>
        <span className="text-xs text-slate-600">{price}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {skins.map(skin => {
          const isOwned    = skin.is_default || owned.includes(skin.id)
          const isEquipped = equipped === skin.id
          const isBuying   = buying === skin.id

          return (
            <div
              key={skin.id}
              className="card border border-white/5 hover:border-white/10 transition-all"
            >
              {/* Color swatch */}
              <div
                className="w-full h-14 rounded-lg mb-3 flex items-center justify-center text-2xl font-black"
                style={{
                  background: `${skin.color}20`,
                  border: `2px solid ${skin.color}40`,
                  color: skin.color,
                  boxShadow: isEquipped ? `0 0 12px ${skin.glow_color}60` : 'none',
                }}
              >
                X
              </div>

              <p className="font-semibold text-slate-200 text-sm truncate">{skin.name}</p>
              <p className="text-xs text-slate-500 mb-3 truncate">{skin.description}</p>

              {skin.is_default ? (
                <button
                  onClick={() => onEquip(skin.id)}
                  disabled={isEquipped}
                  className={`w-full text-xs py-1.5 rounded-lg font-semibold transition-all ${isEquipped ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30' : 'btn-ghost border border-white/10'}`}
                >
                  {isEquipped ? '✓ Equipped' : 'Equip'}
                </button>
              ) : isOwned ? (
                <button
                  onClick={() => onEquip(skin.id)}
                  disabled={isEquipped}
                  className={`w-full text-xs py-1.5 rounded-lg font-semibold transition-all ${isEquipped ? 'border border-opacity-50' : 'btn-ghost border border-white/10'}`}
                  style={isEquipped ? { borderColor: skin.color, color: skin.color, background: `${skin.color}15` } : {}}
                >
                  {isEquipped ? '✓ Equipped' : 'Equip'}
                </button>
              ) : (
                <button
                  onClick={() => onBuy(skin)}
                  disabled={!!buying}
                  className="w-full text-xs py-1.5 rounded-lg font-semibold bg-neon-amber/10 text-neon-amber border border-neon-amber/30 hover:bg-neon-amber/20 transition-all disabled:opacity-40"
                >
                  {isBuying ? '…' : `Buy · ${skin.price}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
