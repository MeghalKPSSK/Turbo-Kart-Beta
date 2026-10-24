"""Keep only the active Blender scene in an exported GLB and compact its mesh data."""

from __future__ import annotations

import json
import os
import struct
from pathlib import Path


JSON_CHUNK = b"JSON"
BIN_CHUNK = b"BIN\0"


def _align4(data):
    return data + (b"\0" * ((-len(data)) % 4))


def compact_glb_file(path):
    """Prune Blender's unrelated scene exports from a GLB, keeping its active scene."""
    path = Path(path)
    source = path.read_bytes()
    if len(source) < 20 or source[:4] != b"glTF":
        raise ValueError(f"Not a GLB file: {path}")
    version, declared_length = struct.unpack_from("<II", source, 4)
    if version != 2 or declared_length != len(source):
        raise ValueError(f"Unsupported or malformed GLB: {path}")

    offset = 12
    gltf = None
    binary = b""
    while offset < len(source):
        chunk_length, chunk_type = struct.unpack_from("<I4s", source, offset)
        chunk_start = offset + 8
        chunk = source[chunk_start:chunk_start + chunk_length]
        if chunk_type == JSON_CHUNK:
            gltf = json.loads(chunk.decode("utf-8").rstrip(" \0"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
        offset = chunk_start + chunk_length
    if gltf is None:
        raise ValueError(f"GLB has no JSON scene: {path}")

    scenes = gltf.get("scenes", [])
    if not scenes:
        raise ValueError(f"GLB has no scenes: {path}")
    scene_index = gltf.get("scene", 0)
    if scene_index >= len(scenes):
        raise ValueError(f"GLB active scene is invalid: {path}")
    active_scene = scenes[scene_index]
    roots = active_scene.get("nodes", [])

    old_nodes = gltf.get("nodes", [])
    kept_node_ids = set()

    def include_node(node_id):
        if node_id in kept_node_ids:
            return
        kept_node_ids.add(node_id)
        for child_id in old_nodes[node_id].get("children", []):
            include_node(child_id)

    for root_id in roots:
        include_node(root_id)
    node_ids = sorted(kept_node_ids)
    node_map = {old: new for new, old in enumerate(node_ids)}

    old_meshes = gltf.get("meshes", [])
    kept_mesh_ids = {old_nodes[node_id]["mesh"] for node_id in node_ids
                     if "mesh" in old_nodes[node_id]}
    mesh_ids = sorted(kept_mesh_ids)
    mesh_map = {old: new for new, old in enumerate(mesh_ids)}

    accessor_ids = set()
    view_ids = set()

    def include_accessor(accessor_id):
        if accessor_id in accessor_ids:
            return
        accessor_ids.add(accessor_id)
        accessor = gltf["accessors"][accessor_id]
        if "bufferView" in accessor:
            view_ids.add(accessor["bufferView"])
        sparse = accessor.get("sparse")
        if sparse:
            view_ids.add(sparse["indices"]["bufferView"])
            view_ids.add(sparse["values"]["bufferView"])

    material_ids = set()
    for mesh_id in mesh_ids:
        for primitive in old_meshes[mesh_id].get("primitives", []):
            material_id = primitive.get("material")
            if material_id is not None:
                material_ids.add(material_id)
            for accessor_id in primitive.get("attributes", {}).values():
                include_accessor(accessor_id)
            if "indices" in primitive:
                include_accessor(primitive["indices"])
            for target in primitive.get("targets", []):
                for accessor_id in target.values():
                    include_accessor(accessor_id)
            for extension in primitive.get("extensions", {}).values():
                if "bufferView" in extension:
                    view_ids.add(extension["bufferView"])

    # Blender's generated road models use procedural materials. Preserve embedded
    # images too if a future hand-authored asset adds them.
    for image in gltf.get("images", []):
        if "bufferView" in image:
            view_ids.add(image["bufferView"])

    old_views = gltf.get("bufferViews", [])
    view_ids = sorted(view_ids)
    view_map = {old: new for new, old in enumerate(view_ids)}
    compact_binary = bytearray()
    new_views = []
    for old_id in view_ids:
        view = dict(old_views[old_id])
        old_offset = view.get("byteOffset", 0)
        byte_length = view["byteLength"]
        data = binary[old_offset:old_offset + byte_length]
        if len(data) != byte_length:
            raise ValueError(f"Invalid buffer view in {path}")
        while len(compact_binary) % 4:
            compact_binary.append(0)
        view["byteOffset"] = len(compact_binary)
        compact_binary.extend(data)
        new_views.append(view)

    accessor_ids = sorted(accessor_ids)
    accessor_map = {old: new for new, old in enumerate(accessor_ids)}
    new_accessors = []
    for old_id in accessor_ids:
        accessor = dict(gltf["accessors"][old_id])
        if "bufferView" in accessor:
            accessor["bufferView"] = view_map[accessor["bufferView"]]
        if "sparse" in accessor:
            sparse = dict(accessor["sparse"])
            sparse["indices"] = dict(sparse["indices"],
                                      bufferView=view_map[sparse["indices"]["bufferView"]])
            sparse["values"] = dict(sparse["values"],
                                     bufferView=view_map[sparse["values"]["bufferView"]])
            accessor["sparse"] = sparse
        new_accessors.append(accessor)

    new_meshes = []
    for old_id in mesh_ids:
        mesh = dict(old_meshes[old_id])
        primitives = []
        for old_primitive in mesh.get("primitives", []):
            primitive = dict(old_primitive)
            primitive["attributes"] = {
                name: accessor_map[index]
                for name, index in primitive.get("attributes", {}).items()
            }
            if "indices" in primitive:
                primitive["indices"] = accessor_map[primitive["indices"]]
            if "targets" in primitive:
                primitive["targets"] = [
                    {name: accessor_map[index] for name, index in target.items()}
                    for target in primitive["targets"]
                ]
            primitives.append(primitive)
        mesh["primitives"] = primitives
        new_meshes.append(mesh)

    new_nodes = []
    for old_id in node_ids:
        node = dict(old_nodes[old_id])
        if "children" in node:
            node["children"] = [node_map[index] for index in node["children"] if index in node_map]
        if "mesh" in node:
            node["mesh"] = mesh_map[node["mesh"]]
        new_nodes.append(node)

    kept_roots = [node_map[index] for index in roots if index in node_map]
    active_scene = dict(active_scene)
    active_scene["nodes"] = kept_roots
    gltf["scene"] = 0
    gltf["scenes"] = [active_scene]
    gltf["nodes"] = new_nodes
    gltf["meshes"] = new_meshes
    gltf["accessors"] = new_accessors
    gltf["bufferViews"] = new_views
    gltf["buffers"] = [dict(gltf["buffers"][0], byteLength=len(compact_binary))]
    if "animations" in gltf:
        gltf.pop("animations")
    if "skins" in gltf and not any("skin" in node for node in new_nodes):
        gltf.pop("skins")
    if "cameras" in gltf and not any("camera" in node for node in new_nodes):
        gltf.pop("cameras")
    if "materials" in gltf:
        # Material indices are stable because we retain the complete small material list.
        for material_id in material_ids:
            if material_id >= len(gltf["materials"]):
                raise ValueError(f"Invalid material reference in {path}")

    json_data = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_chunk = json_data + (b" " * ((-len(json_data)) % 4))
    binary_chunk = _align4(bytes(compact_binary))
    chunks = [struct.pack("<I4s", len(json_chunk), JSON_CHUNK), json_chunk]
    if binary_chunk:
        chunks.extend((struct.pack("<I4s", len(binary_chunk), BIN_CHUNK), binary_chunk))
    payload = b"".join(chunks)
    compacted = struct.pack("<4sII", b"glTF", 2, 12 + len(payload)) + payload
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(compacted)
    os.replace(temporary, path)
    return len(source), len(compacted)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="GLB files to compact")
    for file_path in parser.parse_args().files:
        before, after = compact_glb_file(file_path)
        print(f"{file_path}: {before:,} -> {after:,} bytes")
