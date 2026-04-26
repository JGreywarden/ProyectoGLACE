// modal overlay for save / load slot selection.
// owns its own slot-metadata refresh so callers don't need to wire saveStore boot logic.

import { useEffect, useState } from 'react'
import { useSaveStore, type SaveSlot, type SaveMetadata } from '@/stores/saveStore'

const SLOTS: SaveSlot[] = [1, 2, 3]

interface Props {
  mode:     'save' | 'load'
  onClose:  () => void
  /** called after a successful load — typical caller navigates to /sesion */
  onLoaded?: () => void
  /** called after a successful save — typical caller closes the picker */
  onSaved?:  (slot: SaveSlot) => void
}

export function SaveSlotPicker({ mode, onClose, onLoaded, onSaved }: Props) {
  const storageAvailable = useSaveStore(s => s.storageAvailable)
  const slots            = useSaveStore(s => s.slots)
  const loadSlotMetadata = useSaveStore(s => s.loadSlotMetadata)
  const saveGame         = useSaveStore(s => s.saveGame)
  const loadGame         = useSaveStore(s => s.loadGame)
  const deleteSlot       = useSaveStore(s => s.deleteSlot)

  const [feedback, setFeedback] = useState<string | null>(null)

  // refresh metadata on open so the picker always shows up-to-date timestamps
  useEffect(() => { loadSlotMetadata() }, [loadSlotMetadata])

  function handleSave(slot: SaveSlot) {
    setFeedback(null)
    const result = saveGame(slot)
    if (!result.ok) {
      setFeedback(reasonLabel(result.error))
      return
    }
    setFeedback(`guardado en slot ${slot}`)
    if (onSaved) onSaved(slot)
  }

  function handleLoad(slot: SaveSlot) {
    setFeedback(null)
    const result = loadGame(slot)
    if (!result.file) {
      setFeedback(loadReasonLabel(result.reason))
      return
    }
    onClose()
    if (onLoaded) onLoaded()
  }

  function handleDelete(slot: SaveSlot) {
    if (!window.confirm(`¿Borrar partida del slot ${slot}? Esto no se puede deshacer.`)) return
    deleteSlot(slot)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-deep/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl border border-border-subtle bg-bg-base p-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-border-subtle pb-4">
          <span className="glace-eyebrow">
            — {mode === 'save' ? 'guardar partida' : 'cargar partida'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-display italic text-content-muted hover:text-danger transition-colors"
          >
            cerrar
          </button>
        </div>

        {!storageAvailable && (
          <p className="mt-6 font-display italic text-content-secondary">
            Modo sin guardado: el navegador bloquea localStorage. Las partidas no se conservarán entre sesiones.
          </p>
        )}

        <ul className="mt-6 flex flex-col gap-px bg-border-subtle">
          {SLOTS.map((slot) => (
            <li key={slot} className="bg-bg-deep p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex flex-1 flex-col gap-1">
                  <span className="glace-eyebrow text-content-disabled">slot {slot}</span>
                  <SlotInfo metadata={slots[slot]} />
                </div>

                <div className="flex items-baseline gap-4">
                  {mode === 'save' && (
                    <button
                      type="button"
                      onClick={() => handleSave(slot)}
                      disabled={!storageAvailable}
                      className="font-display text-lg text-content-primary hover:text-ice-200 disabled:text-content-disabled disabled:cursor-not-allowed transition-colors"
                    >
                      {slots[slot] ? 'sobrescribir' : 'guardar aquí'}
                    </button>
                  )}
                  {mode === 'load' && (
                    <button
                      type="button"
                      onClick={() => handleLoad(slot)}
                      disabled={!storageAvailable || !slots[slot]}
                      className="font-display text-lg text-content-primary hover:text-ice-200 disabled:text-content-disabled disabled:cursor-not-allowed transition-colors"
                    >
                      cargar
                    </button>
                  )}
                  {slots[slot] && (
                    <button
                      type="button"
                      onClick={() => handleDelete(slot)}
                      className="font-display italic text-base text-content-muted hover:text-danger transition-colors"
                    >
                      borrar
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {feedback && (
          <p className="mt-5 glace-eyebrow text-frost-400">— {feedback}</p>
        )}
      </div>
    </div>
  )
}

function SlotInfo({ metadata }: { metadata: SaveMetadata | null }) {
  if (!metadata) {
    return (
      <span className="font-display italic text-base text-content-muted">vacío</span>
    )
  }
  const date = formatDate(metadata.fechaGuardado)
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-xl text-content-primary">
        {metadata.nombrePatinador || 'partida sin nombre'}
      </span>
      <span className="font-display italic text-sm text-content-secondary">
        temporada {metadata.temporadaNumero} · semana {metadata.semanaActual} · {date}
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('es-ES', {
      day:   '2-digit', month: '2-digit', year: 'numeric',
      hour:  '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function reasonLabel(error: 'quota_exceeded' | 'serialization_error' | 'storage_unavailable' | undefined): string {
  switch (error) {
    case 'quota_exceeded':      return 'No queda espacio en el navegador para guardar.'
    case 'serialization_error': return 'No se pudo serializar la partida.'
    case 'storage_unavailable': return 'El navegador bloquea localStorage.'
    default:                    return 'No se pudo guardar la partida.'
  }
}

function loadReasonLabel(reason: 'ok' | 'not_found' | 'corrupt' | 'storage_unavailable'): string {
  switch (reason) {
    case 'not_found':           return 'No hay partida en este slot.'
    case 'corrupt':             return 'El guardado está corrupto y no se pudo recuperar.'
    case 'storage_unavailable': return 'El navegador bloquea localStorage.'
    default:                    return 'No se pudo cargar la partida.'
  }
}
