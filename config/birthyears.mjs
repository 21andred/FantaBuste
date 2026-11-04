// Anno di nascita ricavato da config/birthdates.mjs — non modificare qui.
import birthdates from './birthdates.mjs';
export default Object.fromEntries(
  Object.entries(birthdates).map(([name, d]) => [name, Number(String(d).split('/').pop())]),
);
