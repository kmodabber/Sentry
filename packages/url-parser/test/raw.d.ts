// Lets tests import a text file with Vite's "?raw" suffix (used for fixtures/urls).
declare module "*?raw" {
  const text: string;
  export default text;
}
