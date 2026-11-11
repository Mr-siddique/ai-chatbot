import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App.tsx';

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AI Support' })).toBeInTheDocument();
  });
});
