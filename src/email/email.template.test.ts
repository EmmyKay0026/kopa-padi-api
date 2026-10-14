import { describe, expect, it } from 'vitest';
import { renderEmail } from './email.template.js';

describe('renderEmail', () => {
  it('renders responsive HTML and a useful plain-text fallback', () => {
    const rendered = renderEmail({ to: 'ada@example.com', intent: 'ACCOUNT_VERIFICATION', subject: 'Verify', text: 'Confirm your account.', recipientName: 'Ada', actionUrl: 'https://example.com/verify?t=1&x=2', actionLabel: 'Verify email' });
    expect(rendered.html).toContain('<!doctype html>');
    expect(rendered.html).toContain('role="presentation"');
    expect(rendered.html).toContain('https://example.com/verify?t=1&amp;x=2');
    expect(rendered.text).toContain('Hi Ada,');
    expect(rendered.text).toContain('Verify email: https://example.com/verify?t=1&x=2');
  });
  it('escapes user-controlled content', () => {
    const rendered = renderEmail({ to: 'a@b.com', intent: 'JOURNEY_SAFETY', subject: '<unsafe>', text: '<script>alert(1)</script>', recipientName: '<Ada>' });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).toContain('Hi &lt;Ada&gt;,');
    expect(rendered.text).toContain('local emergency services');
  });
});
