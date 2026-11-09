// The stylesheet at a fixed address, /style.css, for the pages the Worker draws itself
// (the stats page and form errors). Site pages use the hashed copy Astro bundles.
import type { APIRoute } from 'astro';
import css from '../styles/style.css?raw';

export const GET: APIRoute = () => new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
