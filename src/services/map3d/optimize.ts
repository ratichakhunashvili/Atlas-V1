import "server-only";

/** The model compressor, for server code only (it pulls in sharp and the Meshopt encoder). */
export { MAX_TEXTURE_SIZE, optimizeModel } from "./optimize-core";
