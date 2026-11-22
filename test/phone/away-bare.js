// The browser put down with no debugger on it (see lib/bare.js): does a routine pause, go quiet and let the screen sleep when
// Home or the lock screen is pressed, and what is found after the browser is killed in the background? Chrome is restarted
// plain and read over its devtools socket; a bridged browser (Firefox) is bare already.
import { bareTour } from './lib/bare.js';

export default (h) => bareTour(h, h.pkg, 'away-bare');
