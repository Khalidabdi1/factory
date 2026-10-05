import type { NextConfig } from 'next';

// Everything runs in the browser, so the site builds to plain static files in out/.
const config: NextConfig = { output:'export' };

export default config;
