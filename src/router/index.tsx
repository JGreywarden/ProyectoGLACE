import { createBrowserRouter } from 'react-router-dom'
import { App } from '@/App'

// routes are added here as pages are built — one entry per page
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [],
  },
])
