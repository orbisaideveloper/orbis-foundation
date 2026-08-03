import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { describe, it, expect, vi } from 'vitest';

describe('ErrorBoundary', () => {
  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Test Content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Test Content')).toBeDefined();
  });

  it('should render fallback UI when an error occurs', () => {
    // ErrorBoundary-র এরর হ্যান্ডলিং টেস্ট করার জন্য কনসোল এরর সাময়িকভাবে অফ করা
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const ThrowError = () => {
      throw new Error('Test Crash');
    };

    render(
      <ErrorBoundary fallback={<div>Error Occurred</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Error Occurred')).toBeDefined();
    consoleSpy.mockRestore();
  });
});
