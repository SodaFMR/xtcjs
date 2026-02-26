import { createRootRoute, Outlet, Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { MangaSearch } from '../components/MangaSearch'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const extraSelection = (
    location.pathname === '/image' ||
    location.pathname === '/video' ||
    location.pathname === '/metadata'
  ) ? location.pathname : ''

  return (
    <>
      <div className="grain" />
      <main className="layout">
        <header className="header">
          <div className="logo">
            <span className="logo-xtc">XTC</span>
            <span className="logo-dot">.</span>
            <span className="logo-js">js</span>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
          <button
            className="manga-search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="Search manga"
            title="Search manga on nyaa.si"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <p className="tagline">
            Optimized XTC Tools for your XTEink X4 · Support by starring on{' '}
            <a
              href="https://github.com/varo6/xtcjs"
              target="_blank"
              rel="noopener"
              style={{ color: 'inherit' }}
            >
              GitHub
            </a>{' '}
            ♥
          </p>
        </header>

        <nav className="nav-tabs">
          <Link to="/" className={`nav-tab${location.pathname === '/' ? ' active' : ''}`}>
            Manga / Comics
          </Link>
          <Link to="/pdf" className={`nav-tab${location.pathname === '/pdf' ? ' active' : ''}`}>
            PDF
          </Link>
          <Link to="/merge" className={`nav-tab${location.pathname === '/merge' ? ' active' : ''}`}>
            Merge / Split
          </Link>
          <div className={`nav-extra${extraSelection ? ' active' : ''}`}>
            <span className="nav-tab nav-tab-static">Extra</span>
            <select
              className="extra-select"
              aria-label="Choose extra tool"
              value={extraSelection}
              onChange={(event) => {
                const next = event.target.value
                if (next) {
                  navigate({ to: next as '/image' | '/video' | '/metadata' })
                }
              }}
            >
              <option value="">Select tool</option>
              <option value="/image">Image</option>
              <option value="/video">Video</option>
              <option value="/metadata">Metadata</option>
            </select>
          </div>
        </nav>

        <Outlet />

        <footer className="footer">
          <p>All processing happens in your browser · Your files never leave your device</p>
          <div className="footer-links">
            <a href="https://github.com/varo6/xtcjs" target="_blank" rel="noopener">GitHub</a>
            <span>·</span>
            <Link to="/about">About</Link>
            <span>·</span>
            <a href="https://github.com/tazua/cbz2xtc" target="_blank" rel="noopener">Based on cbz2xtc</a>
          </div>
        </footer>
      </main>
      <MangaSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
