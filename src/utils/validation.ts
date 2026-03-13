/**
 * 🧬 Input Validation — Reusable validators for all user input fields.
 *
 * Provides max length limits, format validation, character checks,
 * and user-friendly error messages.
 */

// ─── Constants ──────────────────────────────────────────────

export const INPUT_LIMITS = {
    EMAIL: 254,           // RFC 5321
    PASSWORD: 128,
    DISPLAY_NAME: 50,
    PHONE: 20,
    OTP: 6,
    SEARCH_QUERY: 200,
    CHAT_MESSAGE: 10_000,
    TRANSLATE_TEXT: 5000,
    CLONE_TEST_TEXT: 500,
    URL: 2048,
    USERNAME: 64,
    SERVER_URL: 512,
    LICENSE_KEY: 128,
} as const;

// ─── Validation Results ─────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

const OK: ValidationResult = { valid: true };

function fail(error: string): ValidationResult {
    return { valid: false, error };
}

// ─── Validators ─────────────────────────────────────────────

/**
 * Validate email format (RFC-lite: user@domain.tld)
 */
export function validateEmail(email: string): ValidationResult {
    const trimmed = email.trim();
    if (!trimmed) return fail('Email is required');
    if (trimmed.length > INPUT_LIMITS.EMAIL) return fail(`Email must be under ${INPUT_LIMITS.EMAIL} characters`);
    // Simple but effective email regex — covers 99.9% of valid emails
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
        return fail('Please enter a valid email address');
    }
    return OK;
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): ValidationResult {
    if (!password) return fail('Password is required');
    if (password.length > INPUT_LIMITS.PASSWORD) return fail(`Password must be under ${INPUT_LIMITS.PASSWORD} characters`);
    if (password.length < 8) return fail('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) return fail('Password must include an uppercase letter');
    if (!/[a-z]/.test(password)) return fail('Password must include a lowercase letter');
    if (!/[0-9]/.test(password)) return fail('Password must include a number');
    return OK;
}

/**
 * Validate phone number format (digits, +, spaces, dashes, parens)
 */
export function validatePhone(phone: string): ValidationResult {
    const trimmed = phone.trim();
    if (!trimmed) return fail('Phone number is required');
    if (trimmed.length > INPUT_LIMITS.PHONE) return fail('Phone number is too long');
    // Allow: digits, +, -, (, ), spaces
    if (!/^[+\d\s()-]+$/.test(trimmed)) {
        return fail('Phone number contains invalid characters');
    }
    // At least 7 digits
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length < 7) return fail('Phone number is too short');
    if (digitsOnly.length > 15) return fail('Phone number is too long');
    return OK;
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): ValidationResult {
    const trimmed = url.trim();
    if (!trimmed) return fail('URL is required');
    if (trimmed.length > INPUT_LIMITS.URL) return fail('URL is too long');
    if (!/^https?:\/\/(.+\..+|localhost(:\d+)?)/.test(trimmed)) {
        return fail('Please enter a valid URL (e.g., https://example.com)');
    }
    // Block obvious injection patterns
    if (/[<>{}|\\^`]/.test(trimmed)) {
        return fail('URL contains invalid characters');
    }
    return OK;
}

/**
 * Validate display name (no control chars, reasonable length)
 */
export function validateDisplayName(name: string): ValidationResult {
    const trimmed = name.trim();
    if (!trimmed) return fail('Display name is required');
    if (trimmed.length > INPUT_LIMITS.DISPLAY_NAME) {
        return fail(`Display name must be under ${INPUT_LIMITS.DISPLAY_NAME} characters`);
    }
    // Block control characters and excessive whitespace
    if (/[\x00-\x1f\x7f]/.test(trimmed)) {
        return fail('Display name contains invalid characters');
    }
    return OK;
}

/**
 * Validate username (alphanumeric, underscores, dots)
 */
export function validateUsername(username: string): ValidationResult {
    const trimmed = username.trim();
    if (!trimmed) return fail('Username is required');
    if (trimmed.length > INPUT_LIMITS.USERNAME) {
        return fail(`Username must be under ${INPUT_LIMITS.USERNAME} characters`);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        return fail('Username can only contain letters, numbers, dots, dashes, and underscores');
    }
    return OK;
}

/**
 * Validate OTP code (digits only)
 */
export function validateOtp(code: string): ValidationResult {
    const trimmed = code.trim();
    if (!trimmed) return fail('Verification code is required');
    if (!/^\d+$/.test(trimmed)) return fail('Code must contain only digits');
    if (trimmed.length !== INPUT_LIMITS.OTP) {
        return fail(`Code must be ${INPUT_LIMITS.OTP} digits`);
    }
    return OK;
}

/**
 * Generic text length validator
 */
export function validateTextLength(text: string, maxLength: number, fieldName = 'Text'): ValidationResult {
    if (text.length > maxLength) {
        return fail(`${fieldName} must be under ${maxLength.toLocaleString()} characters`);
    }
    return OK;
}

/**
 * Sanitize text: strip control characters, trim excessive whitespace
 */
export function sanitizeText(text: string): string {
    return text
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Strip control chars (keep \t, \n, \r)
        .replace(/\n{4,}/g, '\n\n\n')                         // Max 3 consecutive newlines
        .trim();
}
