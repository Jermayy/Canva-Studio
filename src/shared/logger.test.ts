import { createLogger, redact } from '@shared/logger';

const fixedNow = () => new Date('2026-01-01T00:00:00.000Z');

describe('createLogger', () => {
  it('writes structured JSON with service and context', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'test',
      now: fixedNow,
      sink: (_level, line) => lines.push(line),
    });

    logger.info('hello', { designId: 'd1' });

    expect(JSON.parse(lines[0]!)).toEqual({
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      service: 'test',
      message: 'hello',
      designId: 'd1',
    });
  });

  it('drops entries below the minimum level', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'test',
      minLevel: 'warn',
      sink: (_level, line) => lines.push(line),
    });

    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');

    expect(
      lines.map((line) => (JSON.parse(line) as { message: string }).message),
    ).toEqual(['c', 'd']);
  });

  it('merges child context into every entry', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'test',
      sink: (_level, line) => lines.push(line),
    }).child({ userId: 'u1' });

    logger.info('x', { step: 1 });

    expect(JSON.parse(lines[0]!)).toMatchObject({ userId: 'u1', step: 1 });
  });

  it('writes to the console by default', () => {
    const spies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    const logger = createLogger({ service: 'test', minLevel: 'debug' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.debug).toHaveBeenCalledOnce();
    expect(spies.info).toHaveBeenCalledOnce();
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(spies.error).toHaveBeenCalledOnce();
  });
});

describe('redact', () => {
  it('masks secret-looking keys and flattens errors', () => {
    const result = redact({
      accessToken: 'abc',
      password: 'p',
      apiKey: 'k',
      error: new TypeError('boom'),
      count: 3,
    });

    expect(result).toEqual({
      accessToken: '[REDACTED]',
      password: '[REDACTED]',
      apiKey: '[REDACTED]',
      error: { name: 'TypeError', message: 'boom' },
      count: 3,
    });
  });
});
