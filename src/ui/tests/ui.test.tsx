import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from '../layout/AppHeader';
import { AppLayout } from '../layout/AppLayout';
import { GlassCard } from '../components/GlassCard';

describe('UI Components Render Test (Coverage Restoration)', () => {
  it('should render AppHeader correctly without crashing', () => {
    const html = renderToStaticMarkup(<AppHeader />);
    expect(html).toContain('ORBIS');
    expect(html).toContain('CORE ONLINE');
  });

  it('should render GlassCard correctly with children', () => {
    const html = renderToStaticMarkup(
      <GlassCard title="Test Widget">
        <div>Widget Content</div>
      </GlassCard>
    );
    expect(html).toContain('Test Widget');
    expect(html).toContain('Widget Content');
  });

  it('should render AppLayout correctly wrapping children', () => {
    const html = renderToStaticMarkup(
      <AppLayout>
        <div>Layout Content</div>
      </AppLayout>
    );
    expect(html).toContain('Layout Content');
    expect(html).toContain('ORBIS');
  });
});
