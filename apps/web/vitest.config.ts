import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Calendar-date bugs only show up in UTC-negative zones (a `T00:00:00Z`
// instant renders as the previous local day), so pin one for every test.
process.env.TZ = 'America/Guayaquil';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
