import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

/** A small real GLB: one box-ish mesh, enough for the optimizer to have geometry to compress. */
async function sampleGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions: number[] = [];
  for (let i = 0; i < 3000; i++) positions.push(Math.cos(i) * 5, (i % 50) / 5, Math.sin(i) * 5);
  const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position);
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

describe("compressing an uploaded model", () => {
  it("produces a valid, Meshopt-compressed GLB the map can read", async () => {
    // server-only is a build-time guard; the optimizer itself is plain Node.
    const { optimizeModel } = await import("./optimize-core");
    const input = await sampleGlb();
    const output = await optimizeModel(input);

    assert.equal(new TextDecoder().decode(output.subarray(0, 4)), "glTF");
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    const doc = await io.readBinary(output);
    const used = doc.getRoot().listExtensionsUsed().map((extension) => extension.extensionName);
    assert.ok(used.includes("EXT_meshopt_compression"), `extensions: ${used.join(", ")}`);
    assert.equal(doc.getRoot().listMeshes().length, 1);
  });

  it("is server-only, and attaching an upload uses it with a safe fallback to the original", () => {
    assert.match(readFileSync("src/services/map3d/optimize.ts", "utf8"), /^import "server-only";/);
    const actions = readFileSync("src/features/place-models/actions.ts", "utf8");
    assert.match(actions, /const file = \(await compressStoredModel\(place\.id, stored\)\) \?\? stored;/);
    assert.match(actions, /if \(!uploaded\.ok\) return null;\s+if \(options\.deleteOriginal\) await storageService\.delete\(stored\.key\);/, "the original is deleted only after the copy is stored");
  });

  it("the map can decode Meshopt-compressed models", () => {
    assert.match(readFileSync("src/components/map3d/models-layer.ts", "utf8"), /new GLTFLoader\(\)\.setMeshoptDecoder\(MeshoptDecoder\)/);
  });
});
