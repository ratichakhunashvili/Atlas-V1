import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

/** Textures larger than this are scaled down: sharp on a phone screen, a fraction of the bytes. */
export const MAX_TEXTURE_SIZE = 2048;

/**
 * Makes a model light enough to appear on a phone almost at once:
 *
 *  - duplicate and unused data is removed (dedup, prune, weld);
 *  - textures are resized to at most 2048 px and re-encoded as WebP;
 *  - geometry is quantised and compressed with Meshopt (EXT_meshopt_compression), which the map decodes in a few ms.
 *
 * Returns the new GLB bytes. Throws if the file can't be read; the caller keeps the original in that case.
 */
export async function optimizeModel(input: Uint8Array): Promise<Uint8Array> {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

  const document = await io.readBinary(input);

  await document.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE] }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" })
  );

  return io.writeBinary(document);
}
