import { ErrorBoundary } from '@renderer/app/components/ErrorBoundary';
import { Notice } from '@renderer/app/components/Notice';
import { createLogger } from '@shared/logger';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Notice', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<Notice message={null} onDismiss={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses status for info and alert for errors, and dismisses', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Notice message="Saved" onDismiss={onDismiss} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    rerender(<Notice message="Failed" tone="error" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(onDismiss).toHaveBeenCalled();
  });
});

function Boom(): never {
  throw new Error('render failure');
}

describe('ErrorBoundary', () => {
  it('logs render errors and shows a recovery screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lines: string[] = [];
    const logger = createLogger({
      service: 't',
      sink: (_l, line) => lines.push(line),
    });

    render(
      <ErrorBoundary logger={logger}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(lines.join()).toContain('ui.render_failed');
  });

  it('renders children when nothing fails', () => {
    render(
      <ErrorBoundary logger={createLogger({ service: 't', sink: () => {} })}>
        <p>fine</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
