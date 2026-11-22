import { Navigate } from 'react-router-dom'

/** Home is the rooms list. */
export default function HomePage() {
  return <Navigate to="/rooms" replace />
}
