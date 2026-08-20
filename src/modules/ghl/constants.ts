// LeadConnector (GHL v2) requires a fixed API version header on every
// request, including the OAuth token endpoints. Bump this deliberately when
// adopting a newer contract — do not tie it to "latest".
export const GHL_API_VERSION = '2021-07-28';
