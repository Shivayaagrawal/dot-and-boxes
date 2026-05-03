/// <reference types="vite/client" />

/** Pixi `package.json` exports `./dom` without `types`; map to the bundled declaration. */
declare module "pixi.js/dom" {
  export { DOMContainer } from "pixi.js/lib/dom/DOMContainer";
}
