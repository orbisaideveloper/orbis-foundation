import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { describe, it, expect, vi } from 'vitest';

// 🛠️ LoggerService-কে মক করা হচ্ছে যাতে টেস্টের সময় আসল ফাংশন কল না হয়
vi.mock('../services/logging/LoggerService', () => ({
  LoggerService: {
    logRuntimeError: vi.fn(),
  },
}));

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
    // কনসোল এরর সাময়িকভাবে অফ করা
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
