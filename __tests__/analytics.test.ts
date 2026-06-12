jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { describeError } from '../lib/analytics';

describe('describeError', () => {
  it('serializes Error instances', () => {
    const details = describeError(new TypeError('Bad receipt'));

    expect(details.error_name).toBe('TypeError');
    expect(details.error_message).toBe('Bad receipt');
    expect(details.stack).toEqual(expect.any(String));
  });

  it('serializes plain thrown values', () => {
    const details = describeError('network down');

    expect(details).toEqual({
      error_name: 'Error',
      error_message: 'network down',
      stack: null,
    });
  });
});
