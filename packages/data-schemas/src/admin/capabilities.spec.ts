import {
  SystemCapabilities,
  isValidCapability,
  OVERSIGHT_CAPABILITIES,
  ADMIN_SEED_CAPABILITIES,
} from './capabilities';

describe('isValidCapability', () => {
  it.each(Object.values(SystemCapabilities))('accepts base capability: %s', (cap) => {
    expect(isValidCapability(cap)).toBe(true);
  });

  it.each(['manage:configs:endpoints', 'read:configs:registration', 'manage:configs:speech'])(
    'accepts section-level capability: %s',
    (cap) => {
      expect(isValidCapability(cap)).toBe(true);
    },
  );

  it.each(['assign:configs:user', 'assign:configs:group', 'assign:configs:role'])(
    'accepts assignment capability: %s',
    (cap) => {
      expect(isValidCapability(cap)).toBe(true);
    },
  );

  it.each([
    '',
    'fake',
    'god:mode',
    'manage:configs:',
    'manage:configs: spaces',
    'manage:configs:a:b',
    'delete:configs:endpoints',
    'assign:configs:admin',
    'assign:configs:',
    'MANAGE:USERS',
    'manage:users:extra',
    'read:configs:end points',
  ])('rejects invalid capability: "%s"', (cap) => {
    expect(isValidCapability(cap)).toBe(false);
  });
});

describe('ADMIN_SEED_CAPABILITIES', () => {
  it('leaves the oversight capabilities out of the boot-time ADMIN seed', () => {
    expect(ADMIN_SEED_CAPABILITIES).not.toContain(SystemCapabilities.READ_CONVERSATIONS);
    expect(ADMIN_SEED_CAPABILITIES).not.toContain(SystemCapabilities.EXPORT_CONVERSATIONS);
    expect(ADMIN_SEED_CAPABILITIES).not.toContain(SystemCapabilities.MANAGE_CONTROLS);
  });

  it('seeds every other base capability so admin panel access is unchanged', () => {
    const expected = Object.values(SystemCapabilities).filter(
      (capability) => !OVERSIGHT_CAPABILITIES.has(capability),
    );
    expect([...ADMIN_SEED_CAPABILITIES].sort()).toEqual(expected.sort());
    expect(ADMIN_SEED_CAPABILITIES).toContain(SystemCapabilities.ACCESS_ADMIN);
    expect(ADMIN_SEED_CAPABILITIES).toContain(SystemCapabilities.READ_USAGE);
  });
});
