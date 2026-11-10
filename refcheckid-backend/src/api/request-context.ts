import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthContext } from './http.js';
import type { RuntimePersistence } from '../repositories/runtime-persistence.js';
export const requestContext = new AsyncLocalStorage<{ auth?: AuthContext; store?: RuntimePersistence }>();
