import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface Props {
  children: ReactNode
}

// key={pathname} causes React to unmount+remount the div, triggering the CSS animation
export function PageTransition({ children }: Props) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="glace-page-fade">
      {children}
    </div>
  )
}
