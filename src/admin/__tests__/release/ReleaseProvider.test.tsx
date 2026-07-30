import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { ReleaseProvider, useRelease } from '../../release/ReleaseContext';

// Helper component to test Release context
const TestReleaseConsumer = () => {
  const { currentRelease, initiateDraft, approveRelease, publishRelease, rollbackRelease } = useRelease();

  return (
    <div>
      <div data-testid="release-status">{currentRelease?.status || 'NO_RELEASE'}</div>
      <div data-testid="release-version">{currentRelease?.versionNumber || 'NONE'}</div>
      
      <button onClick={() => initiateDraft('v1.0.0', ['Initial commit'])}>Create Draft</button>
      
      {currentRelease && (
        <>
          <button onClick={() => approveRelease(currentRelease.id)}>Approve</button>
          <button onClick={() => publishRelease(currentRelease.id)}>Publish</button>
          <button onClick={() => rollbackRelease(currentRelease.id)}>Rollback</button>
        </>
      )}
    </div>
  );
};

describe('Release Pipeline Logic (Step-305)', () => {
  it('starts with no active release', () => {
    render(
      <ReleaseProvider>
        <TestReleaseConsumer />
      </ReleaseProvider>
    );
    expect(screen.getByTestId('release-status').textContent).toBe('NO_RELEASE');
  });

  it('handles the full release lifecycle correctly', () => {
    render(
      <ReleaseProvider>
        <TestReleaseConsumer />
      </ReleaseProvider>
    );
    
    // 1. Create Draft
    act(() => { screen.getByText('Create Draft').click(); });
    expect(screen.getByTestId('release-status').textContent).toBe('DRAFT');
    expect(screen.getByTestId('release-version').textContent).toBe('v1.0.0');

    // 2. Approve
    act(() => { screen.getByText('Approve').click(); });
    expect(screen.getByTestId('release-status').textContent).toBe('APPROVED');

    // 3. Publish
    act(() => { screen.getByText('Publish').click(); });
    expect(screen.getByTestId('release-status').textContent).toBe('PUBLISHED');

    // 4. Rollback
    act(() => { screen.getByText('Rollback').click(); });
    expect(screen.getByTestId('release-status').textContent).toBe('ROLLED_BACK');
  });

  it('throws error if useRelease is used outside of Provider', () => {
    const consoleError = console.error;
    console.error = () => {}; // suppress expected error log
    
    const ComponentWithNoProvider = () => {
      useRelease();
      return <div>Will throw</div>;
    };
    
    expect(() => render(<ComponentWithNoProvider />)).toThrow('useRelease must be used within a ReleaseProvider');
    console.error = consoleError;
  });
});
