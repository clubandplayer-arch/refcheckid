import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthContext } from './http.js';
import type { RuntimeStore } from '../repositories/runtime-store.js';
export const requestContext = new AsyncLocalStorage<{ auth?: AuthContext; store?: RuntimeStore }>();
