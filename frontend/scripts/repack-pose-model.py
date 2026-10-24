"""Repack Apache-2.0 BlazePose assets for Tasks without changing model weights.

Optional developer tool; production builds use the checked-in .task archive.
Requires flatbuffers, numpy, and the generated tflite-support 0.4.4 schemas.
"""
import argparse
import hashlib
import importlib.util
from pathlib import Path
import zipfile
import flatbuffers


def load_schema(directory, filename, name):
    spec = importlib.util.spec_from_file_location(name, directory / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def annotate(source, schema, metadata_schema, mean, std, name="MediaPipe BlazePose Lite"):
    model = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(source, 0))
    weights = [bytes(b.data) if b.data is not None else b"" for b in model.buffers]
    meta = metadata_schema.ModelMetadataT()
    meta.name = name
    meta.author = "Google"
    meta.license = "Apache-2.0"
    graph = metadata_schema.SubGraphMetadataT()
    tensor = metadata_schema.TensorMetadataT()
    tensor.name = "image"
    tensor.content = metadata_schema.ContentT()
    tensor.content.contentPropertiesType = metadata_schema.ContentProperties.ImageProperties
    tensor.content.contentProperties = metadata_schema.ImagePropertiesT()
    tensor.content.contentProperties.colorSpace = metadata_schema.ColorSpaceType.RGB
    process = metadata_schema.ProcessUnitT()
    process.optionsType = metadata_schema.ProcessUnitOptions.NormalizationOptions
    process.options = metadata_schema.NormalizationOptionsT()
    process.options.mean = [mean]
    process.options.std = [std]
    tensor.processUnits = [process]
    graph.inputTensorMetadata = [tensor]
    graph.outputTensorMetadata = [metadata_schema.TensorMetadataT() for _ in model.subgraphs[0].outputs]
    meta.subgraphMetadata = [graph]
    builder = flatbuffers.Builder(1024)
    builder.Finish(meta.Pack(builder), b"M001")
    buffer = schema.BufferT()
    buffer.data = builder.Output()
    model.buffers.append(buffer)
    entry = schema.MetadataT()
    entry.name = "TFLITE_METADATA"
    entry.buffer = len(model.buffers) - 1
    model.metadata = (model.metadata or []) + [entry]
    builder = flatbuffers.Builder(1024)
    builder.Finish(model.Pack(builder), b"TFL3")
    output = builder.Output()
    decoded = schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(output, 0))
    assert weights == [bytes(b.data) if b.data is not None else b"" for b in decoded.buffers[:len(weights)]], "Model buffers changed"
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema-dir", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    schema = load_schema(args.schema_dir, "schema_py_generated.py", "model_schema")
    metadata = load_schema(args.schema_dir, "metadata_schema_py_generated.py", "metadata_schema")
    models = [
        ("pose_detector.tflite", "pose_solution_packed_assets.data", 127.5, 127.5),
        ("pose_landmarks_detector.tflite", "pose_landmark_lite.tflite", 0, 255),
    ]
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, filename, mean, std in models:
            entry = zipfile.ZipInfo(name, (2023, 1, 1, 0, 0, 0))
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, annotate((args.source_dir / filename).read_bytes(), schema, metadata, mean, std))
    print("SHA256:", hashlib.sha256(args.output.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
