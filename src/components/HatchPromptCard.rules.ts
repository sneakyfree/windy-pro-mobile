/**
 * Pure visibility rule for the Home Hatch ribbon. Extracted so it can
 * be unit-tested without loading React Native / AsyncStorage through
 * the component import graph.
 */

export function shouldShowHatchPrompt(params: {
    isAuthenticated: boolean;
    flyStatus?: string;
}): boolean {
    if (!params.isAuthenticated) return false;
    const status = params.flyStatus;
    return !status || status === 'not_provisioned' || status === 'available';
}
