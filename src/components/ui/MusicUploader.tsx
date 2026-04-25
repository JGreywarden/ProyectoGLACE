import { useEffect, useRef, useState } from 'react'
import { extractMusicInfo } from '@/features/program'
import type { MusicInfo } from '@/features/program'
import { getMusicLibrary } from '@/services/dataService'
import type { MusicLibraryEntry } from '@/services/dataService'

interface Props {
  current: MusicInfo | null
  onPick:  (info: MusicInfo) => void
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—:—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function MusicUploader({ current, onPick }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<MusicLibraryEntry[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMusicLibrary()
      .then(entries => { if (!cancelled) setLibrary(entries) })
      .catch(() => { if (!cancelled) setLibrary([]) })
    return () => { cancelled = true }
  }, [])

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const info = await extractMusicInfo(file)
      onPick(info)
    } finally {
      setBusy(false)
    }
  }

  async function handleLibraryPick(entry: MusicLibraryEntry) {
    setBusy(true)
    try {
      const info = await extractMusicInfo(entry.id)
      onPick(info)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
        className="border-y border-border-subtle py-8 text-center"
      >
        <p className="font-display italic text-content-muted text-lg">
          arrastra un archivo de audio
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 inline-flex items-baseline gap-2 text-xs uppercase tracking-[0.28em] text-ice-300 hover:text-ice-200 transition-colors"
        >
          <span aria-hidden>+</span>
          o seleccionar
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          aria-label="Subir música"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
          className="hidden"
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="glace-eyebrow">— biblioteca</span>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {library.length === 0 ? (
            <span className="text-xs italic text-content-disabled">vacía</span>
          ) : (
            library.map(entry => {
              const active = current?.sourceId === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleLibraryPick(entry)}
                  className={[
                    'group flex flex-col items-start text-left transition-colors',
                    active ? 'text-ice-200' : 'text-content-secondary hover:text-ice-300',
                  ].join(' ')}
                >
                  <span className="font-display text-base leading-tight">
                    {active && <span className="text-ice-400 mr-1">▸</span>}
                    {entry.title}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-content-muted">
                    {entry.composer}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {current && (
        <div className="border-t border-border-subtle pt-4">
          <p className="font-display italic text-2xl text-content-primary leading-tight">
            «{current.title}»
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-content-muted">
            {fmtDuration(current.duration)}
            {current.tempo ? ` · ${current.tempo} bpm` : ''}
            {current.genero ? ` · ${current.genero}` : ''}
          </p>
        </div>
      )}

      {busy && <p className="text-xs italic text-content-muted">analizando audio…</p>}
    </div>
  )
}
