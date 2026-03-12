// In-memory cache manager
export const CacheManager = {
    store: {},
    set: (key, value) => { this.store[key] = value; },
    get: (key) => { return this.store[key]; }
};