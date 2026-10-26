"""Repack Google Apache-2.0 @mediapipe/hands@0.4.1675469240 for Tasks.
Weights remain unchanged. Uses the same optional schemas as repack-pose-model.py.
"""
import argparse, hashlib, importlib.util, zipfile
from pathlib import Path
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--schema-dir', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('pack', Path(__file__).with_name('repack-pose-model.py'))
pack = importlib.util.module_from_spec(spec); spec.loader.exec_module(pack)
schema = pack.load_schema(args.schema_dir, 'schema_py_generated.py', 'hand_schema')
metadata = pack.load_schema(args.schema_dir, 'metadata_schema_py_generated.py', 'hand_metadata')
packed = (args.source_dir / 'hands_solution_packed_assets.data').read_bytes()
models = [('hand_detector.tflite', packed[2341291:4326731]),
          ('hand_landmarks_detector.tflite', (args.source_dir / 'hand_landmark_lite.tflite').read_bytes())]
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_STORED) as archive:
    for name, data in models:
        entry = zipfile.ZipInfo(name, (2023, 1, 1, 0, 0, 0)); entry.external_attr = 0o644 << 16
        archive.writestr(entry, pack.annotate(data, schema, metadata, 0, 255, name='Google MediaPipe Hands Lite'))
print(hashlib.sha256(args.output.read_bytes()).hexdigest())
