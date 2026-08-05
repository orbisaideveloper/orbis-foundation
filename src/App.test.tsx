import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import '@testing-library/jest-dom';


// Global fetch mock to prevent 'Invalid URL' relative path errors in Vitest/JSDOM
global.fetch = ((url) => {
  return Promise.resolve({
    json: () => Promise.resolve({
      status: 'ONLINE', uptime: '99.99%', ramUsedPercent: '45',
      load: '12.4', arch: 'x64', release: '1.0.0', platform: 'linux', cpuCores: 8, result: 'Mock Tree'
    })
  });
}) as any;

describe('App Component', () => {
  it('renders the application correctly', async () => {
    render(<App />);
    expect(await screen.findByText(/ORBIS Center/i)).toBeInTheDocument();
  });
});
