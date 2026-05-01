import mitt from 'mitt'
import type { GlaceEvents } from '@/types'

// singleton — import `bus` wherever you need cross-feature communication
// prefer direct store updates for same-feature state; bus is for decoupled side-effects
export const bus = mitt<GlaceEvents>()
