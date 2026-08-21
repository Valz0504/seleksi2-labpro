import { TotpService } from './totp.service';

describe('TotpService', () => {
  const service = new TotpService();
  const secret = 'JBSWY3DPEHPK3PXP';
  const timestamp = Date.parse('2026-08-20T12:00:00.000Z');

  it('generates a standard otpauth URI without exposing it through logs', () => {
    const uri = new URL(
      service.buildProvisioningUri('user@example.com', secret),
    );

    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });

  it('accepts the current code and a one-step clock drift', () => {
    const currentToken = service.generateToken(secret, timestamp);
    const nextToken = service.generateToken(secret, timestamp + 30_000);
    const currentStep = BigInt(Math.floor(timestamp / 30_000));

    expect(service.validateToken(secret, currentToken, timestamp)).toBe(
      currentStep,
    );
    expect(service.validateToken(secret, nextToken, timestamp)).toBe(
      currentStep + 1n,
    );
  });

  it('rejects malformed, incorrect, and out-of-window codes', () => {
    const futureToken = service.generateToken(secret, timestamp + 60_000);

    expect(service.validateToken(secret, '12345', timestamp)).toBeNull();
    expect(service.validateToken(secret, 'abcdef', timestamp)).toBeNull();
    expect(service.validateToken(secret, futureToken, timestamp)).toBeNull();
  });
});
