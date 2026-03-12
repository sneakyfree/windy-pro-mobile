/**
 * 🧬 Validation Utility Tests
 */
import {
    validateEmail,
    validatePassword,
    validatePhone,
    validateUrl,
    validateDisplayName,
    validateUsername,
    validateOtp,
    validateTextLength,
    sanitizeText,
    INPUT_LIMITS,
} from '../validation';

describe('validateEmail', () => {
    it('accepts valid emails', () => {
        expect(validateEmail('user@example.com').valid).toBe(true);
        expect(validateEmail('a.b+c@domain.co').valid).toBe(true);
    });

    it('rejects empty email', () => {
        const r = validateEmail('');
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/required/i);
    });

    it('rejects invalid format', () => {
        expect(validateEmail('not-an-email').valid).toBe(false);
        expect(validateEmail('user@').valid).toBe(false);
        expect(validateEmail('@domain.com').valid).toBe(false);
    });

    it('rejects overly long email', () => {
        const long = 'a'.repeat(255) + '@test.com';
        expect(validateEmail(long).valid).toBe(false);
    });
});

describe('validatePassword', () => {
    it('accepts strong password', () => {
        expect(validatePassword('Secret123').valid).toBe(true);
    });

    it('rejects short password', () => {
        const r = validatePassword('Ab1');
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/8 char/i);
    });

    it('rejects missing uppercase', () => {
        expect(validatePassword('secret123').valid).toBe(false);
    });

    it('rejects missing lowercase', () => {
        expect(validatePassword('SECRET123').valid).toBe(false);
    });

    it('rejects missing number', () => {
        expect(validatePassword('SecretABC').valid).toBe(false);
    });

    it('rejects overly long password', () => {
        expect(validatePassword('A1a' + 'x'.repeat(130)).valid).toBe(false);
    });
});

describe('validatePhone', () => {
    it('accepts valid phone numbers', () => {
        expect(validatePhone('+1 (555) 123-4567').valid).toBe(true);
        expect(validatePhone('+447911123456').valid).toBe(true);
    });

    it('rejects empty phone', () => {
        expect(validatePhone('').valid).toBe(false);
    });

    it('rejects invalid characters', () => {
        expect(validatePhone('555-ABC-1234').valid).toBe(false);
    });

    it('rejects too short', () => {
        expect(validatePhone('123').valid).toBe(false);
    });
});

describe('validateUrl', () => {
    it('accepts valid URLs', () => {
        expect(validateUrl('https://example.com').valid).toBe(true);
        expect(validateUrl('http://localhost:3000').valid).toBe(true);
    });

    it('rejects no protocol', () => {
        expect(validateUrl('example.com').valid).toBe(false);
    });

    it('rejects injection characters', () => {
        expect(validateUrl('https://evil.com/<script>').valid).toBe(false);
    });
});

describe('validateDisplayName', () => {
    it('accepts normal names', () => {
        expect(validateDisplayName('John Doe').valid).toBe(true);
    });

    it('rejects empty', () => {
        expect(validateDisplayName('   ').valid).toBe(false);
    });

    it('rejects overly long', () => {
        expect(validateDisplayName('A'.repeat(51)).valid).toBe(false);
    });

    it('rejects control characters', () => {
        expect(validateDisplayName('hello\x00world').valid).toBe(false);
    });
});

describe('validateUsername', () => {
    it('accepts valid usernames', () => {
        expect(validateUsername('john_doe').valid).toBe(true);
        expect(validateUsername('user.name-123').valid).toBe(true);
    });

    it('rejects spaces', () => {
        expect(validateUsername('john doe').valid).toBe(false);
    });

    it('rejects special chars', () => {
        expect(validateUsername('user@name').valid).toBe(false);
    });
});

describe('validateOtp', () => {
    it('accepts 6-digit code', () => {
        expect(validateOtp('123456').valid).toBe(true);
    });

    it('rejects non-digit', () => {
        expect(validateOtp('12345a').valid).toBe(false);
    });

    it('rejects wrong length', () => {
        expect(validateOtp('12345').valid).toBe(false);
        expect(validateOtp('1234567').valid).toBe(false);
    });
});

describe('validateTextLength', () => {
    it('accepts text within limit', () => {
        expect(validateTextLength('hello', 10).valid).toBe(true);
    });

    it('rejects text over limit', () => {
        const r = validateTextLength('hello world', 5, 'Message');
        expect(r.valid).toBe(false);
        expect(r.error).toMatch(/Message/);
    });
});

describe('sanitizeText', () => {
    it('strips control characters', () => {
        expect(sanitizeText('hello\x00world')).toBe('helloworld');
    });

    it('limits consecutive newlines', () => {
        expect(sanitizeText('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
    });

    it('trims whitespace', () => {
        expect(sanitizeText('  hello  ')).toBe('hello');
    });

    it('preserves tabs and normal newlines', () => {
        expect(sanitizeText('a\tb\nc')).toBe('a\tb\nc');
    });
});

describe('INPUT_LIMITS', () => {
    it('has all expected keys', () => {
        expect(INPUT_LIMITS.EMAIL).toBe(254);
        expect(INPUT_LIMITS.PASSWORD).toBe(128);
        expect(INPUT_LIMITS.PHONE).toBe(20);
        expect(INPUT_LIMITS.OTP).toBe(6);
        expect(INPUT_LIMITS.CHAT_MESSAGE).toBe(4000);
        expect(INPUT_LIMITS.SEARCH_QUERY).toBe(200);
        expect(INPUT_LIMITS.SERVER_URL).toBe(512);
    });
});
