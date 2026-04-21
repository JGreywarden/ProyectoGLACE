import { Outlet } from 'react-router-dom'
import { PageTransition } from '@/router/PageTransition'

export function RootLayout() {
  return (
    <div className="min-h-screen bg-bg-deep text-content-primary">
      <PageTransition>
        <Outlet />
      </PageTransition>
    </div>
  )
}
