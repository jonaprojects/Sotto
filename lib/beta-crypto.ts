export const encode = (b: Uint8Array) => btoa(Array.from(b, x => String.fromCharCode(x)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export const nonce = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(s: string) { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))); }
async function key(secret: string) { const bytes = decode(secret); if (bytes.length !== 32)
    throw new Error('Token key must be 32 bytes'); return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encrypt(value: unknown, secret: string, aad: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, await key(secret), new TextEncoder().encode(JSON.stringify(value))); return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`; }
export async function decrypt<T>(value: string, secret: string, aad: string): Promise<T> { const [iv, data] = value.split('.'); const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(aad) }, await key(secret), decode(data)); return JSON.parse(new TextDecoder().decode(plain)) as T; }
export async function signature(value: string, secret: string) { const k = await crypto.subtle.importKey('raw', decode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return encode(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(value)))); }
export async function verify(value: string, sig: string, secret: string) { const k = await crypto.subtle.importKey('raw', decode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); try {
    return await crypto.subtle.verify('HMAC', k, decode(sig), new TextEncoder().encode(value));
}
catch {
    return false;
} }
