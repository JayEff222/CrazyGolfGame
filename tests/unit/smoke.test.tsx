import { render, screen } from '@testing-library/react'
import { App } from '../../src/app/App'

describe('App', () => {
  it('renders the app name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'CrazyGolfGame' })).toBeInTheDocument()
  })
})
