import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard from '../../dashboard/AdminDashboard';
import '@testing-library/jest-dom';

describe('AdminDashboard Full Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/orbis-command') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: 'Mocked Command Success Response' }),
        });
      }
      return Promise.reject(new Error('API Failure'));
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders all main 8 grid cards and updates live data', async () => {
    const { unmount } = render(<AdminDashboard />);
    expect(screen.getByText('ORBIS Center')).toBeInTheDocument();
    expect(screen.getAllByText(/Overview/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Runtime/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/99.99%/i)).toBeInTheDocument();
    });
    unmount();
  });

  it('opens and closes sidebar and triggers menu items', () => {
    render(<AdminDashboard />);
    const hamburgerBtn = screen.getAllByRole('button')[0];
    fireEvent.click(hamburgerBtn);

    expect(screen.getByText(/System Settings/i)).toBeInTheDocument();

    const diagSidebarBtn = screen.getByText('ডায়াগনস্টিক টার্মিনাল');
    fireEvent.click(diagSidebarBtn);
    expect(screen.getByText('Terminal Output')).toBeInTheDocument();

    const closeTermBtn = screen.getByText('Close');
    fireEvent.click(closeTermBtn);

    fireEvent.click(screen.getAllByRole('button')[0]);
    const treeSidebarBtn = screen.getAllByText('লাইভ ডিপেন্ডেন্সি ট্রি')[0];
    fireEvent.click(treeSidebarBtn);
    expect(screen.getByText('Live System Tree (Render Cloud)')).toBeInTheDocument();
  });

  it('executes terminal output and copy button functionality', async () => {
    render(<AdminDashboard />);
    const diagBtn = screen.getByRole('button', { name: /ডায়াগনস্টিক/i });
    fireEvent.click(diagBtn);

    expect(screen.getByText('Terminal Output')).toBeInTheDocument();

    const copyBtn = screen.getByText('⧉ Copy');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('✓ Copied')).toBeInTheDocument();
    });

    const closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);
  });

  it('triggers quick access dependency tree and copies live tree text', async () => {
    render(<AdminDashboard />);
    const treeQuickBtn = screen.getByRole('button', { name: /লাইভ ডিপেন্ডেন্সি ট্রি/i });
    fireEvent.click(treeQuickBtn);

    await waitFor(() => {
      expect(screen.getByText('Live System Tree (Render Cloud)')).toBeInTheDocument();
    });

    const copyBtn = screen.getByText('⧉ Copy');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Mocked Command Success Response');
  });

  it('handles overview sub-cards and source tree view / copy', async () => {
    render(<AdminDashboard />);
    const overviewCard = screen.getAllByText('Overview')[0];
    fireEvent.click(overviewCard);

    await waitFor(() => {
      expect(screen.getByText('Microservices')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('System Phase'));
    expect(screen.getByText('System Phase Data Log')).toBeInTheDocument();

    const copySubLogBtn = screen.getByText('⧉ Copy');
    fireEvent.click(copySubLogBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    fireEvent.click(screen.getByText('← Back'));

    fireEvent.click(screen.getByText('SOURCE MAP'));
    await waitFor(() => {
      expect(screen.getByText('Source Tree Data Log')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('← Back'));
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
  });

  it('handles fetch errors gracefully in executeOrbisCommand and fetchLiveTree', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new Error('Network Error'));

    render(<AdminDashboard />);
    const treeQuickBtn = screen.getByRole('button', { name: /লাইভ ডিপেন্ডেন্সি ট্রি/i });
    fireEvent.click(treeQuickBtn);

    await waitFor(() => {
      expect(screen.getByText('[ERROR] Live Tree Fetch Failed. Check API connection.')).toBeInTheDocument();
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it('handles browser popstate event listener', async () => {
    render(<AdminDashboard />);
    const runtimeCard = screen.getByText(/Runtime/i);
    fireEvent.click(runtimeCard);

    await waitFor(() => {
      expect(screen.getByText(/runtime Monitor/i)).toBeInTheDocument();
    });

    window.dispatchEvent(new Event('popstate'));

    await waitFor(() => {
      expect(screen.queryByText(/runtime Monitor/i)).not.toBeInTheDocument();
    });
  });
});
