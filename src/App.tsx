import { Outlet } from 'react-router-dom'
import { PageTransition } from '@/router/PageTransition'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function RootLayout() {
  return (
    <div className="min-h-screen bg-bg-deep text-content-primary">
      <ErrorBoundary>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </ErrorBoundary>
    </div>
  )
}
