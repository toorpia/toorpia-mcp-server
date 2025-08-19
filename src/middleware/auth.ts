import jwt from 'jsonwebtoken';
import axios from 'axios';
import { AuthContext } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('Auth');

interface JWTPayload {
  sub: string;
  tenant: string;
  scope?: string;
  scopes?: string[];
  iat?: number;
  exp?: number;
}

/**
 * Get JWT public key from JWKS endpoint or environment
 */
async function getPublicKey(): Promise<string> {
  const jwksUrl = process.env.AUTH_JWKS_URL;
  const publicKey = process.env.AUTH_PUBLIC_KEY;

  if (publicKey) {
    return publicKey;
  }

  if (jwksUrl) {
    try {
      const response = await axios.get(jwksUrl, { timeout: 5000 });
      // Simple JWKS parsing - in production, use a proper JWKS library
      const key = response.data.keys?.[0];
      if (key?.x5c?.[0]) {
        return `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;
      }
      if (key?.n && key?.e) {
        // Convert RSA components to PEM format (simplified)
        throw new Error('RSA key conversion not implemented - use AUTH_PUBLIC_KEY instead');
      }
    } catch (error) {
      logger.error('Failed to fetch JWKS:', error);
      throw new Error('Failed to fetch JWT public key from JWKS URL');
    }
  }

  throw new Error('No JWT verification method configured. Set AUTH_JWKS_URL or AUTH_PUBLIC_KEY');
}

/**
 * Parse scopes from JWT payload
 */
function parseScopes(payload: JWTPayload): string[] {
  // Handle different scope formats
  if (payload.scopes && Array.isArray(payload.scopes)) {
    return payload.scopes;
  }
  
  if (payload.scope && typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(s => s.length > 0);
  }
  
  return [];
}

/**
 * Verify JWT token and extract auth context
 */
export async function verifyJWT(token: string): Promise<AuthContext> {
  try {
    const publicKey = await getPublicKey();
    
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256', 'HS256'],
      audience: 'toorpia-mcp',           // Verify audience
      clockTolerance: 120,               // ±2 minutes clock skew tolerance
      maxAge: '15m',                     // Maximum token lifetime: 15 minutes
      ignoreExpiration: false
    }) as JWTPayload;

    if (!decoded.sub || !decoded.tenant) {
      throw new Error('JWT missing required fields: sub or tenant');
    }

    const scopes = parseScopes(decoded);

    return {
      user: decoded.sub,
      tenant: decoded.tenant,
      scopes,
      token
    };

  } catch (error) {
    logger.warn('JWT verification failed:', error);
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

/**
 * Middleware to authenticate MCP requests
 * In MCP over stdio, we need to extract auth from the request context
 */
export async function authenticateRequest(
  authHeader?: string,
  skipAuth: boolean = false
): Promise<AuthContext> {
  
  // For development/testing, allow skipping auth
  if (skipAuth || process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    logger.warn('Authentication skipped - using default context');
    return {
      user: 'dev-user',
      tenant: 'dev-tenant',
      scopes: ['*'], // All permissions for dev
      token: 'dev-token'
    };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new Error('Missing or invalid Authorization header. Expected: Bearer <token>');
  }

  try {
    return await verifyJWT(token);
  } catch (error) {
    logger.error('Authentication failed:', error);
    throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Invalid token'}`);
  }
}

/**
 * Create mock auth context for testing
 */
export function createMockAuth(
  user: string = 'test-user',
  tenant: string = 'test-tenant',
  scopes: string[] = ['mcp:profile', 'mcp:analyze']
): AuthContext {
  return {
    user,
    tenant,
    scopes,
    token: 'mock-token'
  };
}

export default {
  verifyJWT,
  extractBearerToken,
  authenticateRequest,
  createMockAuth
};
