import { defineEventHandler, setHeader } from 'h3';

export default defineEventHandler(event => {
    setHeader(event, 'cache-control', 'no-store');
    return { status: 'ok' };
});
