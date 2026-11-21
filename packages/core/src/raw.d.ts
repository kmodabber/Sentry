// Lets source and tests import a text file with Vite's "?raw" suffix (used for brands/).
declare module "*?raw" {
  const text: string;
  export default text;
}
